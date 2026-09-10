const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const resolvePackage=(name,from=root)=>require.resolve(name+'/package.json',{paths:[from]});
const reactDom=resolvePackage('react-dom'),vite=resolvePackage('vite');
const entries=[
 {name:'@kobalab/majiang-core',file:path.join(root,'vendor/majiang-core-v1.4.1/package.json'),license:'LICENSE',purpose:'formal scoring runtime; adapted local shanten implementation'},
 {name:'react',file:resolvePackage('react'),license:'LICENSE',purpose:'UI runtime'},
 {name:'react-dom',file:reactDom,license:'LICENSE',purpose:'UI runtime'},
 {name:'scheduler',file:resolvePackage('scheduler',path.dirname(reactDom)),license:'LICENSE',purpose:'React scheduling runtime'},
 {name:'vite',file:vite,license:'LICENSE.md',purpose:'generated module-preload helper; build tool'},
 {name:'esbuild',file:resolvePackage('esbuild',path.dirname(vite)),license:'LICENSE.md',purpose:'generated JavaScript helpers; build tool'}
];
let notices='Mahjong Pocket — Third-party notices\n\nKeep this file with redistributed application files.\n\n';
const inventory=[];
for(const entry of entries){
 const metadata=JSON.parse(fs.readFileSync(entry.file,'utf8'));
 let license=fs.readFileSync(path.join(path.dirname(entry.file),entry.license),'utf8');
 if(entry.name==='vite')license=license.split('# Licenses of bundled dependencies')[0].trim();
 notices+=`${entry.name} ${metadata.version}\n${entry.purpose}\n\n${license.trim()}\n\n`;
 inventory.push({name:entry.name,version:metadata.version,license:metadata.license,purpose:entry.purpose});
}
notices+='Tile graphics: FluffyStuff/riichi-mahjong-tiles\nhttps://github.com/FluffyStuff/riichi-mahjong-tiles\n\n'+fs.readFileSync(path.join(root,'public/tiles/LICENSE.md'),'utf8').trim()+'\n\n';
notices+='Back-Pocket.svg and app icons: original graphics created for this project. Fonts: system fonts only; no font files are distributed.\n';
fs.writeFileSync(path.join(root,'public/licenses.txt'),notices);
fs.writeFileSync(path.join(root,'THIRD_PARTY_VERSIONS.json'),JSON.stringify(inventory,null,2)+'\n');
console.log('Generated notices for '+inventory.map(p=>p.name+' '+p.version).join(', '));
