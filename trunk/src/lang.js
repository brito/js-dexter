(function () {
  String.prototype.escapeHTML = function escapeHTML() {
    var s = this;
    s = s.replace(/&/g,"&amp;");
    s = s.replace(/</g,"&lt;");
    s = s.replace(/>/g,"&gt;");
    s = s.replace(/"/g,'&quot;');
    return s;
  };
  String.prototype.unescapeHTML = function unescapeHTML() {
    var s = this;
    s = s.replace(/&lt;/g,"<");
    s = s.replace(/&gt;/g,">");
    s = s.replace(/&#0?39;/g,"'");
    s = s.replace(/&quot;/g,'"');
    s = s.replace(/&amp;/g, "&");
    s = s.replace(/&nbsp;/g, " ");
    return s;
  };
  String.prototype.stripHTML = function stripHTML(delim) {
    return this.replace(/<[^>]+>/ig, delim || '');
  };
  String.prototype.escapeRegEx = function escapeRegEx() {
    var s = this;
    ['\\','!','$','/','.','[',']','+','{','}','-','^','?','*','|','(',')'].forEach(function (letter){
      s = s.replace(new RegExp('\\' + letter, 'g'), '\\' + letter);
    });
    return s;
  };
  String.prototype.supplant = function supplant() {
    var self = this;
    for (var i = 0; i < arguments.length; i++) {
      self = self.replace(new RegExp("\\{" + i + "\\}", 'g'), arguments[i]);
    }
    return self.replace(/\{\d\}/g, '');
  };
  String.prototype.repeat = function repeat(n) {
//    return new Array(n).join(this);
    var a = [];
    while (n) { a.push(this); --n; }
    return a.join('');
  };
  String.prototype.tag = function tag(tagName, attributes) {
    var name = tagName.toLowerCase();
    var s = ['<' + name];
    for (attribute in attributes) {
      var attributeName = attribute == 'className' ? 'class' : attribute;
      s.push(' ' + attributeName + '="' + attributes[attribute] + '"');
    }
    if (this !== '') {s.push( '>' + this + '</' + name + '>'); }
    else { s.push('/>'); }
    return s.join('');
  };
  String.prototype.startsWith = function startsWith(s) { return this.indexOf(s)===0; };
  String.prototype.trim = function trim() { return this.replace(/\n*$|\s*$|^\s*|^\n*/g, '');
  };
  Array.prototype.forEach = function forEach(visitor) {
    var ret = [];
    for (var i=0, len=this.length; i<len;i++) { ret.push(visitor.call(this, this[i], i)); }
    return ret;
  };
  Array.prototype.contains = function contains(obj) {
    for (var i=0, len=this.length; i<len;i++) {if (this[i] === obj) { return true; }}
    return false;
  };
})();
if (typeof CONTEXT_PREFIX == 'undefined') { CONTEXT_PREFIX = '/suite/'; }
if (typeof Log == 'undefined' && typeof WScript != 'undefined') {  
  Log = {
    debug : function () {WScript.Echo(arguments[0]); },
    warn : function () {WScript.Echo(arguments[0]); },
    error : function () {WScript.Echo(arguments[0]); }
  };
} 
function set(){ 
  var result = {};
  for(var i=0; i<arguments.length; i++){ result[arguments[i]] = true; } 
  return result;
}