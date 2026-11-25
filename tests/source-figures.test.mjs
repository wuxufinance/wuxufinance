import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {sanitizeFigure} from '../dist/source-figures.js';
import {renderBody,contentIssues} from '../dist/course-content.js';
import {safeBody} from '../server/validation.mjs';
const {document}=parseHTML('<html><body></body></html>');
const source='<svg viewBox="0 0 400 200" onload="alert(1)"><style>body{display:none}</style><script>alert(1)</script><foreignObject><iframe src="https://example.test/"></iframe></foreignObject><image href="https://example.test/pixel"/><defs><marker id="arrow" markerWidth="10" markerHeight="10"><path d="M0 0L10 5L0 10Z"/></marker></defs><path d="M10 10L200 100" marker-end="url(#arrow)" stroke="#143e35"/><text x="10" y="20">资产池100亿</text><text x="200" y="100">优先级70亿</text></svg>';
const safe=sanitizeFigure(source,document,'checked');assert(!/onload|alert|script|style|iframe|foreignObject|example\.test|href/.test(safe));assert(safe.includes('资产池100亿'));assert(safe.includes('优先级70亿'));assert(safe.includes('url(#checked-0)'));assert(safe.includes('viewBox="0 0 400 200"'));assert.throws(()=>sanitizeFigure('<p>no image</p>',document));
const marker='<p>图示源码：'+JSON.stringify({svg:safe}).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</p>';const course={sections:[{title:'图示',body:safeBody(marker)}],cases:[]};assert.deepEqual(contentIssues(course),[]);const out=renderBody(course.sections[0].body,document);assert(out.includes('<svg'));assert(out.includes('source-figure'));assert(!out.includes('图示暂时无法显示'));assert(!out.includes('onload'));
const broken=renderBody('<p>图示源码：'+JSON.stringify({svg:'&lt;svg&gt;&lt;/svg&gt;'})+'</p>',document);assert(broken.includes('figure-fallback'));
const formula=renderBody('<table><tr><td>FCFF</td><td><p>公式：EBIT(1-T)+D\\&amp;A-CapEx-\\Delta NWC</p></td></tr></table>',document);const root=document.createElement('div');root.innerHTML=formula;assert.equal(root.querySelectorAll('math').length,1);assert.equal(root.querySelectorAll('.formula-fallback').length,0);
console.log('Passed: original SVG geometry/labels, inert diagram boundary, and single rendering of formulas nested in tables.');

const multiline='<svg viewBox="0 0 100 100"><defs><linearGradient id="shade"><stop offset="0%" stop-color="#278164"/><stop offset="100%" stop-color="#8ebc6b"/></linearGradient></defs><path d="M 0,0\n L 50,50\n L 100,0 Z" fill="url(#shade)"/></svg>';
const preserved=sanitizeFigure(multiline,document,'multiline');assert(preserved.includes('L 50,50'));assert(preserved.includes('linearGradient'));assert(preserved.includes('url(#multiline-0)'));assert(!sanitizeFigure('<svg viewBox="0 0 10 10"><path d="M0 0L5 5" fill="url(https://evil.invalid/x)"/></svg>',document).includes('evil.invalid'));
const emptySvgNodes=sanitizeFigure('<svg viewBox="0 0 10 10"><title /><desc /><g /><path d="M0 0L5 5"/></svg>',document);
const emptyRoot=document.createElement('div');emptyRoot.innerHTML=emptySvgNodes;assert.equal(emptyRoot.querySelectorAll('title path,desc path').length,0);assert(emptySvgNodes.includes('<title></title>'));
