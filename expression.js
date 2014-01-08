var ReParse = require('reparse').ReParse;
var natural = require('natural');
var tokenizer = new natural.WordTokenizer();
var porter2 = require('stem-porter');

// --------------- grammar bits -------------------

function expr() {
  return this.chainl1(term, disjunction);
}

function term() {
  return this.chainl1(notFactor, conjunction);
}

function notFactor() {
  return this.choice(negation, factor);
}

function factor() {
  return this.choice(group, phrase, word);
}

function group() {
  return this.between(/^\(/, /^\)/, expr);
}

function phrase() {
  return this.between(/^\"/, /^\"/, words);
}

function words() {
  return this.many1(word).join(' ');
}

function word() {
  return this.match(/^[#@_\-'&!\w\dàèìòùáéíóúäëïöüâêîôûçßåøñœæ]+/i).toString();
}

function notop() {
  return this.match(/^NOT/i).toUpperCase();
}

function negation() {
  return this.seq(notop, notFactor).slice(1);
}

function conjunction() {
  return OPTREES[this.match(/^AND/i).toUpperCase()];
}

function disjunction() {
  return OPTREES[this.match(/^OR/i).toUpperCase()];
}

var OPTREES = {
  'AND': function(a,b) { return [ 'AND', a, b ] },
  'OR': function(a,b) { return [ 'OR', a, b ] }
};

// --------------- test strings -------------------

function evalTree(tree, text) {
  if (!Array.isArray(tree)) {
    //return text.toLowerCase().indexOf(tree.toLowerCase()) >= 0;
    // TODO: cache these regexps?
    return new RegExp("\\b"+tree+"\\b", "i").test(text);
  }
  var op = tree[0];
  if (op == 'OR') {
    return evalTree(tree[1], text) || evalTree(tree[2], text);
  }
  else if (op == 'AND') {
      return evalTree(tree[1], text) && evalTree(tree[2], text);
  }
  else if (op == 'NOT') {
      return !evalTree(tree[1], text);
  }
}

// --------------- collect terms -------------------

function flattenTree(tree) {
  // TODO: unique leaves, sorted?
  return collectLeaves(tree, [], true);
}

function collectLeaves(tree, leaves, notnot) {
  if (!Array.isArray(tree)) {
    if (notnot) {
      leaves.push(tree);
    }
  }
  else {
    if (tree[0] == "NOT") {
      notnot = !notnot;
    }
    // i = 1 to skip AND/OR
    for (var i = 1; i < tree.length; i++) {
      collectLeaves(tree[i], leaves, notnot);
    }
  }
  return leaves;
}

// --------------- stem tree -------------------

// stems tree in place
function _stemTree(tree) {
  if (!Array.isArray(tree)) {
	 // tokenize to handle phrases
    var tokenText = tokenizer.tokenize(tree);

    var stemText = tokenText.map(function(word) {
      return porter2(word);
    }).join(' ');
	 
    return stemText;
  } else {
    var op = tree[0];
    if (op == 'OR') {
      tree[1] = _stemTree(tree[1]);
	   tree[2] = _stemTree(tree[2]);
		return tree;
    }
    else if (op == 'AND') {
        tree[1] = _stemTree(tree[1]);
	     tree[2] = _stemTree(tree[2]);
		  return tree;
    }
    else if (op == 'NOT') {
        tree[1] = _stemTree(tree[1]);
		  return tree;
    }
  }
}

// returns stemmed copy of tree
function stemTree(tree) {
  var _tree = tree.slice(0);	// copy tree
  _stemTree(_tree);
  return _tree;
}

// --------------- public interface -------------------

function Expression(query, stem) {
    query = typeof query !== 'undefined' ? query : '';
    stem = (typeof stem === 'boolean') ? stem : false;

    this.tree = new ReParse(query, true).start(expr);
    if (stem === true) this.tree = stemTree(this.tree);	// optionally, stem leaves of tree
}

Expression.prototype = {
    flatten: function() {
        return flattenTree(this.tree);
    },
    test: function(text) {
        return evalTree(this.tree, text);
    }
}

module.exports = Expression;
