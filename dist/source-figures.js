// Import original diagrams as inert, locally rendered SVG. No scripts, foreign HTML,
// external URLs, event attributes, stylesheets, animation or image resources survive.
const tags=new Set(['svg','g','path','line','rect','circle','ellipse','polyline','polygon','text','tspan','defs','marker','clippath','lineargradient','radialgradient','stop','title','desc']);
const geometry=new Set(['x','y','x1','x2','y1','y2','cx','cy','r','rx','ry','width','height','dx','dy','stroke-width','stroke-dasharray','stroke-dashoffset','opacity','fill-opacity','stroke-opacity','stop-opacity','offset','font-size','font-weight','markerwidth','markerheight','refx','refy']);
const colors=/^(?:none|transparent|currentColor|#[a-f\d]{3,8}|rgba?\([\d., %]+\)|[a-z]{1,20})$/i;
const numbers=/^[\d.eE+\-\s,%]+$/;
export function sanitizeFigure(source,document,prefix='figure'){
  if(typeof source!=='string'||source.length>180000)throw Error('图示源码过长或无效');
  const input=document.createElement('template');input.innerHTML=source.replace(/<([a-zA-Z][a-zA-Z0-9-]*)([^<>]*?)\s*\/>/g,'<$1$2></$1>');const svg=input.content?.querySelector('svg')||input.querySelector('svg');if(!svg)throw Error('图示缺少SVG根节点');
  const ids=new Map();for(const e of [svg,...svg.querySelectorAll('[id]')])if(e.id)ids.set(e.id,prefix+'-'+ids.size);
  function copy(node){if(node.nodeType===3)return document.createTextNode(node.textContent);if(node.nodeType!==1)return null;const tag=node.tagName.toLowerCase();if(!tags.has(tag))return null;const out=document.createElementNS('http://www.w3.org/2000/svg',({clippath:'clipPath',lineargradient:'linearGradient',radialgradient:'radialGradient'})[tag]||tag);
    for(const attr of [...node.attributes]){const name=attr.name.toLowerCase(),v=attr.value;if(name==='id'&&ids.has(v))out.setAttribute('id',ids.get(v));else if(name==='viewbox'&&/^[\d.eE+\-\s,]+$/.test(v))out.setAttribute('viewBox',v);else if(geometry.has(name)&&numbers.test(v))out.setAttribute(({markerwidth:'markerWidth',markerheight:'markerHeight',refx:'refX',refy:'refY'})[name]||name,v);else if(['fill','stroke','color','stop-color'].includes(name)&&colors.test(v))out.setAttribute(name,v);else if(name==='d'&&/^[MmZzLlHhVvCcSsQqTtAa\d.eE+\-\s,]+$/.test(v))out.setAttribute('d',v);else if(name==='points'&&numbers.test(v))out.setAttribute(name,v);else if(name==='transform'&&/^(?:(?:translate|scale|rotate|matrix|skewX|skewY)\([\d.eE+\- ,]+\)\s*)+$/.test(v))out.setAttribute(name,v);else if(['text-anchor','dominant-baseline','alignment-baseline','stroke-linecap','stroke-linejoin','markerunits','orient','fill-rule','clip-rule'].includes(name)&&/^[a-zA-Z0-9. -]{1,40}$/.test(v))out.setAttribute(({markerunits:'markerUnits'})[name]||name,v);else if(['clip-path','marker-end','marker-start','marker-mid','fill','stroke'].includes(name)){const m=v.match(/^url\(#([^\s()]+)\)$/);if(m&&ids.has(m[1]))out.setAttribute(name,'url(#'+ids.get(m[1])+')');}
      else if(name==='class'&&/^[a-zA-Z0-9_ -]{1,300}$/.test(v))out.setAttribute('class',v);}
    for(const child of node.childNodes){const safe=copy(child);if(safe)out.append(safe);}return out;}
  const result=copy(svg);if(!result.getAttribute('viewBox')){const w=Number(svg.getAttribute('width')),h=Number(svg.getAttribute('height'));if(w>0&&h>0)result.setAttribute('viewBox','0 0 '+w+' '+h);else throw Error('图示缺少有效尺寸');}
  result.removeAttribute('width');result.removeAttribute('height');result.setAttribute('role','img');result.setAttribute('aria-label','原课图示（静态）');
  // Explicit end tags survive both HTML and SVG parsers, including empty title/desc integration points.
  return result.outerHTML.replace(/<([a-zA-Z][a-zA-Z0-9-]*)([^<>]*?)\s*\/>/g,'<$1$2></$1>');
}
export function renderSourceFigure(value,document,prefix){const data=JSON.parse(value);if(typeof data.svg!=='string')throw Error('图示数据缺失');return '<figure class="source-figure">'+sanitizeFigure(data.svg,document,prefix)+'<figcaption>原课图示。图中参数与数据为教学设定；交互计算请使用本讲计算器。</figcaption></figure>';}
