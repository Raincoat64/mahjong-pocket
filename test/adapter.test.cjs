const test=require('node:test');
const assert=require('node:assert/strict');
const {MajiangCoreCalculator}=require('../dist-test/adapter/majiang-core.js');
const {createInitialRound}=require('../dist-test/engine/round.js');

class FakeShoupai{
  constructor(tiles=[]){this.tiles=tiles;this._fulou=[];this._lizhi=false;this._zimo=null;}
  clone(){const x=new FakeShoupai(this.tiles.slice());x._fulou=this._fulou.slice();x._lizhi=this._lizhi;x._zimo=this._zimo;return x;}
  zimo(p){this._zimo=p;return this;}
}

function makeCore(){
  const calls={rules:[],hule:[],allow:[]};
  const core={
    rule(param={}){calls.rules.push(param);return {...param}},
    Shoupai:FakeShoupai,
    Game:{allow_hule(...args){calls.allow.push(args);return true}},
    Util:{
      xiangting(){return 0},tingpai(){return []},
      hule(shoupai,rongpai,param){
        calls.hule.push({shoupai,rongpai,param});
        const f=[0,0,0,0];
        const w=param.menfeng;
        if(rongpai){
          // test fixture assumes discarder is dealer seat 0
          f[w]+=8000+(param.jicun.lizhibang||0)*1000;
          f[0]-=8000;
        }else{
          for(let i=0;i<4;i++)if(i!==w){f[i]-=2000;f[w]+=2000;}
          f[w]+=(param.jicun.lizhibang||0)*1000;
        }
        return {hupai:[{name:'test',fanshu:1}],defen:8000,fenpei:f};
      }
    }
  };
  return {core,calls};
}

test('adapter project rules disable double yakuman and south extension',()=>{
  const {core,calls}=makeCore();
  new MajiangCoreCalculator(core);
  assert.equal(calls.rules[0]['場数'],1);
  assert.equal(calls.rules[0]['延長戦方式'],0);
  assert.equal(calls.rules[0]['ダブル役満あり'],false);
  assert.equal(calls.rules[0]['切り上げ満貫あり'],false);
});

test('score params carry double-riichi and tenhou without incorrectly adding haitei',()=>{
  const {core,calls}=makeCore();
  const calc=new MajiangCoreCalculator(core);
  const state=createInitialRound(200,1000);
  state.players[0].riichi=true;
  state.players[0].doubleRiichi=true;
  state.winResult={type:'TSUMO',winners:[0],winningTile:state.lastDrawnTile};
  calc.calculateScore(state,0);
  const p=calls.hule.at(-1).param;
  assert.equal(p.hupai.lizhi,2);
  assert.equal(p.hupai.tianhu,1);
  assert.equal(p.hupai.haidi,0);
});

test('rinshan never becomes haitei merely because live-tile count is zero',()=>{
  const {core,calls}=makeCore();
  const calc=new MajiangCoreCalculator(core);
  const state=createInitialRound(201,1000);
  state.lastDrawSource='RINSHAN';
  state.wall.drawIndex=state.wall.deadWallStart-state.wall.rinshanDrawCount;
  state.winResult={type:'TSUMO',winners:[0],winningTile:state.lastDrawnTile,context:'RINSHAN'};
  calc.calculateScore(state,0);
  const p=calls.hule.at(-1).param;
  assert.equal(p.hupai.lingshang,true);
  assert.equal(p.hupai.haidi,0);
  assert.equal(p.hupai.tianhu,0);
});

test('double ron settlement gives riichi deposits to first priority winner only',()=>{
  const {core,calls}=makeCore();
  const calc=new MajiangCoreCalculator(core);
  const state=createInitialRound(202,1000);
  state.riichiSticks=2;
  state.winResult={type:'RON',winners:[1,3],loser:0,winningTile:'m1',context:'DISCARD'};
  const result=calc.settleWin(state);
  assert.deepEqual(calls.hule.map(x=>x.param.jicun.lizhibang),[2,0]);
  assert.deepEqual(result.pointChanges,[-16000,10000,0,8000]);
});
