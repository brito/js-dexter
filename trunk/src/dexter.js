//    Documentation Extractor (DEXTeR)
//    Copyright (C) 2006  Francisco M Brito
//
//    This program is free software; you can redistribute it and/or
//    modify it under the terms of the GNU General Public License
//    as published by the Free Software Foundation; either version 2
//    of the License, or (at your option) any later version.
//
//    This program is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with this program; if not, write to the Free Software
//    Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.

/**
* Documentation Extractor (DEXTeR);
* Parses a JavaScript file and generates documentation.
* 
* @constructor
* 
* @author francisco.brito
* @version 1.0
* @date 04/6/2006
*/
function $Dexter() {
  var _self = this; 

 /* -------- private fields -------- */
  var re = {
    documentBlock : /(\/\*\*[^'"]|\/\*\s+\n)[\w\W]*?\*\/[\w\W]*?((?=\/\*)|$)/g,
    body: /\*\/[\n\s]*\n([\w\W]*)/,
    summary: /^[^@]*?((\n+|<br \/>)|(\.\s)|(.(?=@))|$)/,
    declaration: /(\s)*([^\n]+)?/,
    canonicalFunction: /function ([$\w_]+) ?\(([\w, _]*)\) *\{/,
    property: /(?:this|_self)\.([\w]+)(( *= *)|;)/,
    prototype: /([\w]+)\.prototype\.([$_\w]+) *= *function ?\2?\(([\w, _]*)\) *\{/,
    variable: /var ([\w$_]+) *= */,
    method: /(?:this|_self)\.([\w]+) *= *function ?\1?\(([\w, _$]*)\) *\{/,
    json: /([\w$_]+) *= *\{/,
    jsonMethod: /([\w]+) *: *function ?\1?\(([\w, _$]*)\) *\{/,
    jsonProperty: /([\w$_]+) *: *([^\n])?/,
    DomElementEnumerator: /getElements?By(Id|TagName|AttributeValue)\(/,
    DomElementCreator: / *(=|:) *document\.createElement\(('|")(\w+)("|')\)/,
    DomElementGetter: /(\$|getObject)\(/,
    fileName : /([^\\\/]+?)\.(\w+)#?([\w$_]?)$/
  };
/*
* These are the tags that are parsed and returned as properties of the
* Documentation Object. 
* 
* Each rule must has a tag property and label, if displayed. The decorator property (optional)
* indicates how each of the tag values found will be rendered. This is a function
* that takes an array (the array of tag values for this tag). 
*/
  var _tagRules = [
    {tag: 'author', label: 'Author'},
    {tag: 'param', label: 'Parameters', decorator: function (array) {
      return array.forEach(function (item) {
        return item.replace(/^(.+?) (\(optional\))?/, '$1'.tag('CODE') + ' $2: ');
      });
    }},
    {tag: 'example', label: 'Example', decorator: function (array) {
        return array.forEach(function (item) {
          return item.tag('CODE');
        });
    }},
    {tag: 'return', label: 'Returns'},
    {tag: 'default', label: 'Defaults to'},
    {tag: 'exception', label: 'Exception'},
    {tag: 'since', label: 'Since', decorator: function (array) {
      array.forEach(function (version) {
        _versions.add(Number(version));
        return version;
      });
      return array[0].split();
    }}, 
    {tag: 'deprecated', label: 'Deprecated'},
    {tag: 'see', label: 'See Also'},
    {tag: 'type'}
  ];
  var _tags = _tagRules.forEach(function (rule) { return rule.tag; });

  /*
  * These rules parse keywords to transform fragments within the documentation, like
  * adding link or image tags to an HTML document.
  * 
  * Each rule must have the properties:
  *  - regex: a string representing the fragment that goes within the keyword brackets @{regex}.
  *  - decorator: the function that manipulates the match to return the modified string.
  *    This function must take into account the format from _self.flags.format
  */
    var _keywordRules = [
      {regex:'link (.+?)',
        decorator: function (match, $1) {
          var link = $1.split(' | '), href = link[0], label = (link[1] || href);
          if (_self.flags.format.match(/^text$/i)) { return '{0}'.supplant(label); }
          if (href.startsWith('http://')) { return label.link(href); }
          if (href.startsWith('/')) { return label.link(CONTEXT_PREFIX + href); }
          else { return label.link('#' + href.replace(/[\(\)]*/g,'')); }
        }
      },
      {regex:'img ([^ ]+) (.+?)',
        decorator: function (match, $1, $2) {
          if (_self.flags.format.match(/^text$/i)) { return ''; }
          var src = $1;
          if (src.startsWith('/')) { src = CONTEXT_PREFIX + src; }
          return Tag('IMG', {src: src, alt: $2});
        }
      }
    ];
  /*
  * Keeps track of the versions declared and orders them,
  * first being at index 0 and last being at index length - 1
  */
  var _versions = new (function () {
    var __self = [];
    __self.getLast = function getLast() {
      __self.sort(sortNumbers);
      return __self[__self.length - 1];
    };
    __self.getFirst = function getFirst() {
      __self.sort(sortNumbers);
      return __self[0];    
    };
    __self.add = function add(v) {
      if (!__self.contains(v)) { __self.push(v); }
    };
    function sortNumbers(a, b) { return a - b; } 
    return __self;
  })();


 /* -------- public fields -------- */
 /**
 * Warnings and errors generated by all the documents parsed
 */
 _self.warnings = [];
 /**
 * Global settings
 * - version: the version to document. All documentation whose <code>since</code>
 *   tag exceeds this number will not be included in the generated document. Defaults
 *   to <code>Number.MAX_VALUE</code>, which renders all versions.
 * - includePrivateDocs: if true, private documentation will also be extracted. Defaults
 *   to false.
 * - isRenderNewOnly: whether or not to get only the changes specific to the version
 *   retrieved when used in combination with the version flag. Defaults to false.
 *  - format: default output format (text, html, wiki, etc.) as defined by the decorators
 *  - tabChar: character to use for indenting entries in the documentation (text)
 *  - outputPath: if specified, the documentation will be written to this file
 *  - isDebugEnabled: if true, debugging messages will be output to the console
 *  - isQuiet: if true, all console output will be supressed, including warnings and errors
 */
 _self.flags = {
   version: Number.MAX_VALUE,
   includePrivateDocs: false,
   isRenderNewOnly: false,
   format: 'text',
   tabChar : '\t',
   returnChar: '\n',
   outputPath: null,
   isDebugEnabled: false,
   isQuiet: false
 };
 /**
 * An cumulative {@link JDictionary} built from all {@link build} queries on this
 * instance
 */
 _self.dictionary = new JDictionary();
 /**
 * A map of formatting functions by format name. {@link DocumentBlock} decorators
 * take the block and its relative depth as a node; and returns a string. 
 * {@link JDictionary} and {@link JDoc} decorators take the respective objects and
 * return a string as well.
 * 
 * The bof and eof decorators provide means to insert a header or footer, for example, 
 * at the end of each type processed. This function takes the object for an argument.
 */
 _self.decorator = {
   toc: function (node, depth) {
     var indent = _self.flags.tabChar.repeat(depth), returnChar = _self.flags.returnChar;
     var prologue = (depth || !node.isClass)?indent:'';
     return prologue + node.name + returnChar;
   },
   summary: function (node, depth) {
     var indent = _self.flags.tabChar.repeat(depth), returnChar = _self.flags.returnChar;
     var prologue = (depth || !node.isClass)?indent+ ' - ':' ';
     var signature = node.signature ? node.signature + ': ' + node.type + 
       (!node.isPublicMember?' (private)':'') + '. ':'';
     var summary = prologue +
       signature + node.summary + returnChar;
     return  summary.unescapeHTML().stripHTML();
   },
   full : function (node, depth) {
     var indent = _self.flags.tabChar.repeat(depth), returnChar = _self.flags.returnChar;
     var indentMore = _self.flags.tabChar.repeat(depth + 1);
     var prologue = (depth || !node.isClass)?indent+ '':'';
     var signature = node.signature ? node.signature + ': ' + node.type + 
       (!node.isPublicMember?' (private)':'') + '. ':'';
     var re_return = new RegExp(returnChar.repeat(2), 'g');
     var nodeDescription =  node.description.replace(re_return, returnChar + indent);
     var description = prologue + signature + nodeDescription;
     _tagRules.forEach(function (rule){
       var tag = node[rule.tag];
       if (!tag || !tag[0] || !rule.label) { return; }
       description += returnChar + indent;
       description +=  (rule.label + ': ').tag('STRONG') + returnChar + indentMore;
       description += rule.decorator ? rule.decorator(tag).join(returnChar + indentMore) : tag.join(', ');
     });
     var re_list = new RegExp(returnChar + _self.flags.tabChar + '(-|\d+\.)', 'g');
     description = description.replace(re_list, returnChar + indentMore + '$1');
     description = description.tag('DIV');
     description += returnChar.repeat(2);
     return description.unescapeHTML().stripHTML();
   },
   jdictionary: function (jdictionary) { return _self.flags.returnChar; },
   jdoc: function (jdoc) { return  jdoc.path + _self.flags.returnChar; },
   bof: function (obj) {
     if (obj instanceof JDictionary) { return ''; }
     else if (obj instanceof JDoc) { return ''; }
     else if (obj instanceof Node) { return ''; }
     else { return ''; }
   },
   eof: function (obj) {
     if (obj instanceof JDictionary) { return '-'.repeat(80); }
     else if (obj instanceof JDoc) { return _self.flags.returnChar; }
     else if (obj instanceof Node) { return ''; }
     else { return ''; }
   }
 };

 
 /* -------- public methods -------- */
 /**
 * Lists all the JavaScript files in the specified directory, recursively. If the path specified 
 * corresponds to a file, its containing directory will be used as the path.
 * 
 * @param path the fully qualified path to the containing directory
 * @return an array of paths corresponding to files found with a *.js extension
 * within the directory
 */
 _self.listFiles = function listFiles(path) {
   var list = [];
   path = path.replace(re['fileName'], '');
   var fso = new ActiveXObject("Scripting.FileSystemObject");
   var folder = fso.GetFolder(path);
   addPaths(folder);
   function addPaths(folder) {
     var files = new Enumerator(folder.files);
     while (!files.atEnd()) {
       var filePath = files.item().Path;
       if ((/\.js$/).test(filePath)) { list.push(filePath); }
       files.moveNext();
     }
     var folders = new Enumerator(folder.SubFolders);
     for (;!folders.atEnd(); folders.moveNext()) {
       addPaths(folders.item());
     }
   }
   return list;
 };
 /**
 * Generates a {@link JDictionary} for the specified path or paths. All {@link JDoc}s
 * extracted are put in the {@link dictionary} property of this instance
 * 
 * @param path (multiple allowed) the absolute locations of the files to be documented
 * @return a {@link JDictionary} object
 */
 _self.build = function build(path) {
   var jdic = new JDictionary();
   for (var i=0;i<arguments.length;++i) {
     path = arguments[i];
     if (path.match(re['fileName'])) { jdic.add(new JDoc(path)); }
     else { _self.listFiles(path).forEach(function (path){ jdic.join(_self.build(path)); }); }
   }
   _self.dictionary.join(jdic);
   _self.warnings = _self.warnings.concat(jdic.warnings);
   return jdic;
 };
 /**
* Extracts the documentation for the given path.
* 
* @param detail (optional) the amount of information extracted from the file. Can be
*    "toc" (table of contents), "summary" or "full". If more than one format should be
*    returned, this argument can be an array such as: ['toc', 'summary']. Defaults to "full".
* @param outputPath (optional) the fully qualified path or URL to write or post the
* results to
* @return a documentation string in the specified format (set by flags) and detail level
*/
 _self.extract = function extract(detail, outputPath) {
   outputPath = outputPath || _self.flags.outputPath;
   var content = _self.dictionary.content;
   var text = _self.format(_self.dictionary, detail);
   if (outputPath) {
     if (!_self.flags.isQuiet && _self.flags.isDebugEnabled) { Log.debug('Writing to ' + outputPath); }
     return writeFile(outputPath, text);
   } else { return text; }
 };
 /**
 * Reads a {@link DocumentBlock}, {@link JDoc} or {@link JDictionary} and styles it 
 * according to the specified detail level. The output depends also on the current format flag.
 * 
 * @param obj the object to be styled
 * @param detail (optional) toc, summary or full
 * @param isHeadOnly (optional) returns only the block's topmost elements without
 * their members' documentation. Applies only to {@link DocumentBlock}s. Defaults
 * to false
 * @return a documentation string
 */
 _self.format = function format(obj, detail, isHeadOnly) {
   var buf = '';
   if (detail instanceof Array) {
     detail.forEach(function (detail){
       buf += _self.format(obj, detail, isHeadOnly);
     });
   } else { 
     buf += _self.decorator['bof'](obj);
     if (obj instanceof JDictionary) { 
       buf += _self.decorator['jdictionary'](obj);
       for (var path in obj.content){ buf += _self.format(obj.content[path], detail); }  
     } else if (obj instanceof JDoc) { 
       if (!_self.flags.isQuiet && _self.flags.isDebugEnabled) { Log.debug('Formatting ' + obj.path + ' as ' + detail); }
       buf += _self.decorator['jdoc'](obj);
       if (obj.tree) { buf += _self.format(obj.tree, detail); }
     } else {
       if (!(obj instanceof Node)) { throw new Error('Object not supported'); }
       obj.forEach(function format(node, name, depth) {
         if (isHeadOnly && depth) { return; }
         buf += _self.decorator[detail](node, depth);
       });  
     }
     buf += _self.decorator['eof'](obj);
   }
   return buf;
 };

 /* -------- private methods -------- */
 /*
 * Retrieves source code from the file system
 * @param path the fully qualified path on the file system
 * @return the contents of the file
 */
 function loadFile(path) {
   var READ = 1;
   var fso = new ActiveXObject("Scripting.FileSystemObject");
   var textFile = fso.OpenTextFile(path, READ);
   return textFile.readAll();
 }
 /*
 * Retrieves a document from an internet location using XMLHttpRequest
 * @param path the fully qualified URI
 * @return the server response document
 */
 function loadURL(path) {
 }
 /*
 * Creates a file and puts the contents in it. Can be used only when Dexter is
 * used from command line.
 */
 function writeFile(filename, text, isAppend) {
   var WRITE = 2, APPEND = 8;
   var fso = new ActiveXObject("Scripting.FileSystemObject");
   var textFile = fso.OpenTextFile(filename,isAppend?APPEND:WRITE,true);
   textFile.Write(text);
   textFile.Close();
 }
 /*
 * Creates a directory in the specified path. Can be used only when Dexter is
 * used from command line.
 */
 function writeDirectory(path) {
 }
 /**
 * An organization of {@link JDoc} objects. 
 * 
 * Properties:
 * - content: a map of {@link JDoc}s, by path
 * - index: a map of {@link DocumentBlock}s by name.
 * 
 * Methods:
 * - add: adds a {@link JDoc} to this dictionary
 * - join: adds non repeating paths from another {@link JDictionary} to this one
 * 
 * @constructor
 * @todo handle name collisions in index (same object name in different files)
 */
 function JDictionary() {
   this.content = {};
   this.index = {};
   this.warnings = [];
   this.add = function add(jdoc) {
     this.content[jdoc.path] = jdoc;
     this.warnings = this.warnings.concat(jdoc.warnings);
     for (var name in jdoc.dictionary){ this.index[name] = jdoc.dictionary[name]; }
   };
   // does not merge, only add non repeating paths
   this.join = function join(jdic) {
     for (var path in jdic.content){ this.add(jdic.content[path]); }
   };
   return this;
 }
 /**
 * API documentation. This object represents one documented JavaScript file. 
 * 
 * Properties:
 * - path: the fully qualified location of this object
 * - source: the original source
 * - versions: an array of version variations found ("since" tag)
 * - tree: a hierarchical organization of {@link DocumentBlock}s
 * - dictionary: a flat map of {@link DocumentBlock}s by object name
 * - warnings: an array of messages about documentation problems found
 * 
 * When objects are documented in batch per file, additional properties can be
 * accessed on each of the {@link DocumentBlock}s:
 * - srcPath: the path to the file where this object has been declared
 * - line: the line number in the file where this object has been declared
 * - index: the order in the source file where the object was found in.
 * - parent: this property is overridden with the name of the parent node in the tree, if any
 * - parentNode: the parent's {@link DocumentBlock}
 * - childNodes: the children {@link DocumentBlock}s
 * - hasChildNodes: whether or not this object has any members documented
 * - isPublicMember: whether or not this object can be directly accessed from outside
 * 
 * @constructor
 * @param path the location of the source code and its documentation
 * 
 */
 function JDoc(path) {
   var thisJdoc = this;
   path = path.replace(re['fileName'], '$1.$2');
   thisJdoc.path = path;
   thisJdoc.source = loadFile(path);
   var docs = [];
   thisJdoc.versions = []; 
   thisJdoc.dictionary = {};
   thisJdoc.warnings = [];
   var tokens = thisJdoc.source.match(re['documentBlock']) || [];
   for (var i=0;i<tokens.length;++i) { 
     var doc = new DocumentBlock(tokens[i], {index:i, srcPath:path});
     doc.line = getLineNumber(thisJdoc.source, doc.declaration);     
     docs.push(doc);
     doc.warnings.forEach(function (blockWarnings){
       blockWarnings.forEach(function (warning){
//         if (!warning.trim()) { return; }
         var msg = path + ':' + doc.line + ' - ' + warning;
         if (!_self.flags.isQuiet) { Log.warn(msg); }
         thisJdoc.warnings.push(msg);         
       });
     });
   }
   var structure = getDependencies(docs, _self.flags.includePrivateDocs);
   thisJdoc.tree = structure.tree;
   thisJdoc.dictionary = structure.dictionary;
   return thisJdoc;
 }
 /**
 * Parses a documentation block. All tags are extracted, all link and see tags  are 
 * translated. Source HTML is escaped, except for the code tag. All text is preformatted
 * for HTML, so it needs additional formatting for text-only output.
 * 
 * Properties:
 * - summary: the first sentence of the documentation
 * - description: the documented description, sans tags
 * - body: the lines of code following the documentation block
 * - declaration: the first line of code that follows the documentation block, if any
 * - textIndent: the number of tab or space characters found on the declaration line.
 * - name: the name of the object being documented
 * - args: the function arguments, if applicable. These are parsed from the declaration,
 *     not the documented parameter tags.
 * - parent: if an addition to an object's prototype, the name of the object. 
 * - type: the type of object being documented 
 * - matchType: the name of the regular expression type used to determine this object's type
 * - isPrivate: boolean indicating whether this block of documentation should appear in the
 *     public API or not.
 * - signature: a combination of the arguments found in the declaration and the ones
 *     declared in the parameters tag, if the object type is a function. Otherwise, 
 *     this is the name of the property.
 * 
 * Tags exposed as properties:
 * - author: an array of names
 * - parameters: an array of parameter names and descriptions
 * - returns: an array of returns and descriptions
 * - exception: an array of exceptions and descriptions
 * - since: version when introduced (numeric)
 * - deprecated: notes on deprecation
 * - see: links to other objects or documents
 * 
 * @constructor
 * @param token the string containing the documentation and first line of code, if any
 * @param properties (optional) any additional properties set on the object that cannot be extracted
 * from the token, declared as an object.
 */
 function DocumentBlock(token, properties) {
   var thisBlock = this;
   var returnChar = _self.flags.returnChar, tabChar = _self.flags.tabChar;
   thisBlock.warnings = [];
   thisBlock.srcPath = properties.srcPath || '';
   // normalize carriage regurns
   token = token.replace(/\r\n/g,'\n');
   // body
   token = token.replace(thisBlock.body = token.match(re['body'])[1], '');
   // declaration and indent
   thisBlock.textIndent = thisBlock.body.match(re['declaration'])[1].length;
   thisBlock.declaration = thisBlock.body.match(re['declaration'])[2];
   // determine if token should appear in public API
   thisBlock.isPrivate = !!token.match(/^\/\*[^\*]/);
   // remove "/**", "/*" and "*/"
   token = token.replace(/(^\/\*\*?\s)|\*\/\n?/g,'');
   // escape HTML
   token = token.escapeHTML();
   // unescape slashes
   token = token.replace(/\\\//g, '/');
   // unescape CODE tag
   token = token.replace(/&lt;(\/?code)&gt;/g, '<$1>');
   // normalize text within CODE tag
   token = token.replace(/<code>[\w\W]+?<\/code>/g, function (match) {
     var s = match.replace(/\n?\s*\*/g, returnChar);
     return s.replace(' ', tabChar).replace(/\n/g, returnChar);
   });
   // normalize unordered lists
   token = token.replace(/\n\s*\*?\s*-/g, returnChar + tabChar + '-');
   // normalize double carriage returns
   token = token.replace(/\n\s*\*?\s*\n\s*\*?\s/g, returnChar.repeat(2));
   // normalize ordered lists
   token = token.replace(/\n\s*\*?\s*(\d\.)/g, returnChar + tabChar +'$1');
   // remove leading asterisks
   token = token.replace(/\n?\s*\*/g, '');
   // remove all remaining line breaks
//   token = token.replace(/\n/g, '');
   // parse keywords
   _keywordRules.forEach(function (rule) {
     var regex = new RegExp('(?!&lt;code&gt;)\{@' + rule.regex + '\}(?!&lt;\/code&gt;)', 'ig');
     token = token.replace(regex, rule.decorator);
   });
   //parse properties
   thisBlock.summary = (token.match(re['summary'])[0] || '').replace(/\n|^\s+|\s+$/g, '');
   var typeMatch = matchType(thisBlock.declaration.replace(/[\r\n]/g, ''));
   thisBlock.matchType = typeMatch[0];
   thisBlock.name = typeMatch[1] || '';
   thisBlock.args = typeMatch[2] || [];
   thisBlock.parent = typeMatch[3];
   thisBlock.type = getObjectType(thisBlock);
   if (thisBlock.type == 'function' && token.match(/@constructor/)) { thisBlock.type = 'constructor'; }
   if (thisBlock.matchType == 'json' && token.match(/@static/)) { thisBlock.isStatic = true; }

  // parse tags. Each tag removes its entry from the token
  _tags.forEach(function (tag) {
    var re = new RegExp('@' + tag + '[^@]+', 'ig');
    var match = token.match(re);
    if (match || !thisBlock[tag]) {
      thisBlock[tag] = match || [];
      token = token.replace(re, '');
      thisBlock[tag] = thisBlock[tag].forEach(function (item) {
        return item.replace(new RegExp('@' + tag + 's? '), '').trim();
      });
    }
  });
  // unrecognized declaration and no @type tag
  if (thisBlock.type == 'unknown') { thisBlock.warnings.push(['Unknown object type: ' + thisBlock.declaration]); }
  // all other undeclared tags are silently swallowed
  token = token.replace(/@.+?(\n|$)/, '');
  // clean up spaces
  thisBlock.description = token.replace(/ +/g, ' ').trim();
  // generate signature, if applicable
  if (thisBlock.type in set('function', 'constructor')) {
    var signatureObj = parseSignature(thisBlock);
    thisBlock.signature = signatureObj.signature;
    if (signatureObj.structure.warnings) {
      thisBlock.warnings.push(signatureObj.structure.warnings);
    }
  } else { thisBlock.signature = thisBlock.name; }
  return thisBlock;
 } 
 /*
 * Creates the object's signature, if it is a function. The block's args and param
 * properties are used to determine the signature and which parameters are
 * optional.
 * 
 * Properties:
 * - structure: a map of the intersection between arguments and documented 
 *     parameters by name
 * - warnings: an array of messages indicating irregularities in the documentation
 */
 function parseSignature(block) {
   var signature = block.name + '(';
   if (block.matchType == 'prototype') { signature = block.parent.toLowerCase() + '.' + signature; }
   var structure = (function () {
     var structure = {warnings:[], args: {}};
     block.param.forEach(function (param) {
       var re_param = /([\w$_]+)\b( ?\(optional\))?/;
       var paramName = param.match(re_param)[1];
       var isOptional = !!param.match(re_param)[2];
       structure.args[paramName] = {isOptional: isOptional};
     });
     block.args.forEach(function (arg) {
       if (structure.args[arg]) { return; }
       structure.args[arg] = {isOptional:false};
       if (!block.isPrivate) { structure.warnings.push('Undocumented parameter: ' + arg); }       
     });
     return structure;
   })();
   for (var arg in structure.args){
     signature += structure.args[arg].isOptional ? ' [, {0}]'.supplant(arg) : ', ' + arg;
   }
   signature = signature.replace(/\(( \[)?, /,'($1') + ')';
   return {signature:signature, structure: structure};
 }
 /*
  * Evaluates the string to determine the entry type. The returned array will contain
  * the properties relevant to the match found:
  * 
  * [match type, name, args (if any), parent (if applicable)]
  * 
  * @return an array with the relevant submatches, according to the type found.
  */
  function matchType(string) {
    var entry = string.split(/\r\n/)[0], match;
    if ((match = entry.match(re['prototype']))) {
      return  ['prototype', match[2], match[3]?match[3].split(/, ?/):'', match[1]];
    } else if ((match = entry.match(re['method']))) {
      return  ['method', match[1], match[2]?match[2].split(/, ?/):''];
    } else if ((match = entry.match(re['canonicalFunction']))) {
      return  ['canonical', match[1], match[2]?match[2].split(/, ?/):''];
    } else if ((match = entry.match(re['variable']))) {
      return  ['variable', match[1]];
    } else if ((match = entry.match(re['property']))) {
      return  ['property', match[1]];
    } else if ((match = entry.match(re['json']))) {
      return  ['json', match[1]];
    } else if ((match = entry.match(re['jsonMethod']))) {
      return  ['jsonMethod', match[1], match[2]?match[2].split(/, ?/):''];
    } else if ((match = entry.match(re['jsonProperty']))) {
      return  ['jsonProperty', match[1]];
    } else { return ['object']; }
  }
  /*
  * Evaluate the runtime type of the object.
  * 
  * @param type the object type (parsed by regex)
  * @param declaration the line of code that declares the object
  * @return a human-readable type name
  */
  function getObjectType(block) {
    switch (block.matchType) {
        case 'canonical' : return "function";
        case 'property' : return getRuntimeType(block.declaration);
        case 'method' : return "function";
        case 'prototype' : return "function";
        case 'json' : return "object";
        case 'jsonMethod' : return "function";
        case 'jsonProperty' : return getRuntimeType(block.declaration);
        case 'variable' : return getRuntimeType(block.declaration);
        default : return 'object';
    }
    function getRuntimeType(declaration) {
      var isConstructor = declaration.match(/new (\w+?)\(/);
      if (isConstructor) { return isConstructor[1]; }
      var isFunction = !declaration.match(/^var /) && declaration.match(/function ?\(/);
      if (isFunction) { return "function"; }
      if (declaration.match(/ *(=|:) *\[|new Array\(/)) { return 'Array'; }
      if (declaration.match(/ *(=|:) *(true|false)($|;)/)) { return 'Boolean'; }
      if (declaration.match(/ *(=|:) *(\d+($|;)|Number\.)/)) { return 'Number'; }
      if (declaration.match(/ *(=|:) *\//)) { return 'RegExp'; }
      if (declaration.match(/ *(=|:) *'|"|new String\(/)) { return 'String'; }
      if (declaration.match(/ *(=|:) *\{|new .*?\(/)) { return 'Object'; }
      if (declaration.match(/ *(=|:) *new \(function ?\(/)) { return 'Object'; }
      if (declaration.match(/ *(=|:) *null/)) { return 'Object'; }
      if (declaration.match(re['DomElementGetter'])) { return 'HTMLElement'; }
      if (declaration.match(re['DomElementEnumerator'])) { return 'HTMLElement'; }
      if (declaration.match(re['DomElementCreator'])) { return 'HTMLElement'; }
      return "unknown";
    }
  }
  /*
  * Determines the dependencies between documentBlocks. The result is a tree of
  * dependencies, where each node represents a documented object.
  * 
  * The structure is not determined by compiling the code, rather by examining each
  * object's syntax and documentation.
  * 
  * @param documentBlocks an array of DocumentBlock objects
  * @param includePrivateDocs (optional) whether or not to include private documents 
  * (not marked for public API). Defaults to false.
  * @return a tree of dependencies
  */
  function getDependencies(documentBlocks, includePrivateDocs) {
    if (!documentBlocks.length) { return new Node(); }
    var dictionary = {}; 
    var root = new Node({name: 'root'});
      root.toString =  function () {  
        var buf = '';
        this.forEach(function (node, name, depth){
          buf += _self.flags.tabChar.repeat(depth) + name + _self.flags.returnChar;
        });
        return buf;
      };
    var isClassFile = false;
    var lastPublicObject;
    var block0 = documentBlocks[0];
    var re_className = new RegExp(block0.name.replace(/^\$/, '') + '.js$');
    if (block0.srcPath.match(re_className)) { 
      block0.isClass = isClassFile = true;
      block0.isPublicMember = true;
      block0.parentNode = root;
      if (!_self.flags.isQuiet && block0.isPrivate) { Log.warn('{0} does not have public documentation!'.supplant(block0.name)); }
    }
    documentBlocks.forEach(function (block, i) {
      if (block.isPrivate && !includePrivateDocs) { return; }
      dictionary[block.name] = (block = new Node(block));
      var matchType = block.matchType;
      var isProperty = matchType in set('property', 'method', 'jsonProperty', 'jsonMethod', 'prototype');
      // handle prototype declarations
      if (matchType == 'prototype') {
        if (!root.childNodes[block.parent]) { 
          root.appendChild(new Node({
            summary: '',
            description: '',
            name: block.parent,
            type: 'object',
            signature: block.parent,
            isPublicMember:true
          })); 
        }
      }
      if (block.isStatic) { isClassFile = false; } // break class file parsing style
      if (!block.parent && isClassFile && !block.isClass && !block.isStatic) { block.parent = block0.name; }
      // append block to parent
      if (dictionary[block.parent]) { dictionary[block.parent].appendChild(block); }
      else if (block.isClass || (!isClassFile && !isProperty) || block.isStatic){ root.appendChild(block); }
      else if (matchType == 'prototype') { root.childNodes[block.parent].appendChild(block); }
      else if (isProperty && lastPublicObject) { lastPublicObject.appendChild(block); }
      else { 
        var warning = 'Parent "{0}" not found in tree: {1}'.supplant(block.parent, block.name);
        block.warnings.push(warning);
      }
      block.isPublicMember = block.isClass || block.isStatic ||
        (block.parentNode && block.parentNode.name == 'root' && block.matchType in set('canonical', 'json')) ||
        (isProperty && block.parentNode && block.parentNode.isPublicMember);
      if (block.isPublicMember && !isProperty) { lastPublicObject = block; }
    });
    return {tree:root,dictionary:dictionary};
  }
  /*
  * Tree element; contains properties and methods for tree traversal.
  * 
  * @constructor
  */
  function Node(o) {
    this.parentNode = null;
    this.hasChildNodes = false;
    this.childNodes = {};
    this.forEach = function forEach(visitor, depth) {
      depth = depth || 0;
      var ret = new Node();
      for (var name in this.childNodes) {
        ret.childNodes[name] = new Node(visitor.call(this, this.childNodes[name], name, depth));
        ret.hasChildNodes = true;
        if (this.childNodes[name].hasChildNodes) {
          ret.appendChild(new Node(this.childNodes[name].forEach(visitor, depth + 1))); 
        }
      }
      return ret;
    };
    this.appendChild = function appendChild(node) {
      node.parentNode = this;
      this.hasChildNodes = true;
      this.childNodes[node.name] = node;
      return node;
    };
    for (var prop in o) { this[prop] = o[prop]; }
    return this;
  }
  /*
  * Finds the line number where the line is declared in the source.
  * 
  * @return a positive number if the line was found, -1 otherwise.
  */
  function getLineNumber(source, line) {
    var a = source.split(new RegExp(line.escapeRegEx()))[0].match(/\r?\n/g);
    if (a) { return a.length; }
    else { return -1; }
  }

 /*
 * Initialization procedure. 
 * 
 * 1. Builds from a config path, if any (<code>config={path:'filePath.js'}</code>)
 */
 function init() {
   if (_self.config.path) { _self.build(_self.config.path); }
 }

 /* -------- end declaration -------- */ 
  if ((_self.config = arguments[0])) {
    (function updateConfig() {
      for (var prop in _self.config){ 
        if (prop != 'flags') { _self[prop] = _self.config[prop]; }
        else { for (var flag in _self.config.flags){ _self.flags[flag] = _self.config.flags[flag]; } }        
      }
    })();   
  }
 init();
 return _self;
}