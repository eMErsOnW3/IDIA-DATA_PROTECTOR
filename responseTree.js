// Safe structural clone: never copy HTML, styles, event handlers, or remote assets.
(() => {
  'use strict';
  const tags=new Set('p div span h1 h2 h3 h4 h5 h6 ul ol li table thead tbody tfoot tr th td pre code strong b em i blockquote br hr a del s sup sub'.split(' '));
  const skip=new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','IMG','SVG','MATH','BUTTON','INPUT','TEXTAREA','SELECT']);
  function snapshot(root){
    let nodes=0,characters=0;
    function walk(node,depth){
      if(++nodes>10000||depth>60)throw new Error('This response is too large for the local viewer.');
      if(node.nodeType===3){characters+=node.data.length;if(characters>200000)throw new Error('This response is too large for the local viewer.');return {text:node.data};}
      if(node.nodeType!==1||skip.has(node.tagName)||node.hidden||node.getAttribute('aria-hidden')==='true'||node.closest('[data-idia-response-ui]'))return null;
      const tag=tags.has(node.localName)?node.localName:'div';
      return {tag,children:[...node.childNodes].map(n=>walk(n,depth+1)).filter(Boolean)};
    }
    return walk(root,0);
  }
  function validate(tree){
    let count=0,size=0;
    function walk(n,depth){
      if(!n||typeof n!=='object'||++count>10000||depth>60)throw new Error('Invalid response snapshot.');
      if(typeof n.text==='string'){size+=n.text.length;if(size>200000)throw new Error('Response snapshot too large.');return {text:n.text};}
      if(!tags.has(n.tag)||!Array.isArray(n.children))throw new Error('Invalid response structure.');
      return {tag:n.tag,children:n.children.map(c=>walk(c,depth+1))};
    }
    return walk(tree,0);
  }
  const plain=tree=>typeof tree.text==='string'?tree.text:(tree.children||[]).map(plain).join('');
  function render(tree,document){
    if(typeof tree.text==='string')return document.createTextNode(tree.text);
    const node=document.createElement(tree.tag);
    if(tree.tag==='a'){node.setAttribute('aria-disabled','true');node.title='Links are inactive in the local viewer.';}
    for(const child of tree.children)node.append(render(child,document));return node;
  }
  function decode(root,mappings){
    // Join text nodes so a token split across bold/code spans still matches.
    // Only exact token intervals change; other DOM structure remains intact.
    const walker=root.ownerDocument.createTreeWalker(root,NodeFilter.SHOW_TEXT),spans=[];let text='',node;
    while((node=walker.nextNode())){const start=text.length;text+=node.data;spans.push({node,start,end:text.length});}
    for(const f of IDIATokenSyntax.find(text).reverse()){
      if(!Object.hasOwn(mappings,f.value))continue;
      const hit=spans.filter(s=>s.start<f.end&&s.end>f.start);
      for(let i=hit.length-1;i>=0;i--){const s=hit[i],start=Math.max(0,f.start-s.start),end=Math.min(s.end-s.start,f.end-s.start);
        s.node.data=s.node.data.slice(0,start)+(i===0?mappings[f.value]:'')+s.node.data.slice(end);}
    }
  }
  globalThis.IDIAResponseTree=Object.freeze({snapshot,validate,plain,render,decode});
})();
