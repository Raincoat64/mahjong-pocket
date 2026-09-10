const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'../dist-test');
const out=path.resolve(__dirname,'../playable-preview/mahjong-core.bundle.js');
function walk(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
    const p=path.join(dir,e.name);
    return e.isDirectory()?walk(p):(e.isFile()&&e.name.endsWith('.js')?[p]:[]);
  });
}
const modules={};
for(const file of walk(root)){
  const id=path.relative(root,file).replace(/\\/g,'/').replace(/\.js$/,'');
  modules[id]=fs.readFileSync(file,'utf8');
}
const vendorRoot=path.resolve(__dirname,'../vendor');
for(const file of walk(vendorRoot)){
  const id='vendor/'+path.relative(vendorRoot,file).replace(/\\/g,'/').replace(/\.js$/,'');
  modules[id]=fs.readFileSync(file,'utf8');
}
const parts=[];
parts.push(`(function(){"use strict";\nconst modules={};\n`);
for(const [id,code] of Object.entries(modules)){
  parts.push(`modules[${JSON.stringify(id)}]=function(module,exports,require){\n${code}\n};\n`);
}
parts.push(`
const cache={};
function normalize(id){
  const out=[];
  for(const p of id.split('/')){if(!p||p==='.')continue;if(p==='..')out.pop();else out.push(p)}
  return out.join('/');
}
function resolve(request,from){
  if(request.startsWith('.')){
    const base=from.split('/').slice(0,-1).join('/');
    return normalize(base+'/'+request);
  }
  return request;
}
function load(id){
  id=normalize(id);
  if(cache[id])return cache[id].exports;
  if(!modules[id])throw new Error('Browser bundle module not found: '+id);
  const module={exports:{}};cache[id]=module;
  modules[id](module,module.exports,(req)=>load(resolve(req,id)));
  return module.exports;
}
load('browser/entry');
})();
`);
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,parts.join(''),'utf8');
console.log(out);
