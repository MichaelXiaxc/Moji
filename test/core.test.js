import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generate,transform,GrblStream} from '../src/core.js';
const cfg={width:210,height:297,feed:800,zFeed:100,up:-3,down:0};
const element={x:10,y:20,scale:1,angle:0,paths:[[[0,0],[10,10]]]};
test('G-code preserves top-left page coordinates and retracts toward negative Z',()=>{const code=generate([element],cfg);assert.ok(code.includes('G0 X10 Y20\nG1 Z0 F100'));assert.ok(code.includes('G1 X20 Y30 F800'));assert.ok(code.endsWith('G1 Z-3 F100\n'));});
test('rotation and scaling are applied before bounds checking',()=>{assert.deepEqual(transform([[2,0]],{x:1,y:2,scale:2,angle:0}),[[5,2]]);assert.throws(()=>generate([{...element,x:205}],cfg),/超出/);assert.throws(()=>generate([] ,cfg),/没有/);});
test('stream waits for ok, pauses and aborts on errors',async()=>{const written=[];const stream=new GrblStream(async s=>written.push(s));stream.start(['G21','G90','G0 X1']);assert.deepEqual(written,['G21\n']);stream.receive('<Idle>');assert.equal(written.length,1);stream.paused=true;stream.receive('ok');assert.equal(written.length,1);stream.paused=false;await stream.pump();assert.equal(written[1],'G90\n');stream.receive('error:2');stream.receive('ok');assert.equal(stream.active,false);assert.equal(written.length,2);});
test('a serial write failure cancels the remaining job',async()=>{const stream=new GrblStream(async()=>{throw Error('disconnected');});stream.start(['G21','G90']);await new Promise(r=>setTimeout(r,0));assert.equal(stream.active,false);assert.equal(stream.queue.length,0);});

test('Z retract must be smaller than contact Z for this machine',()=>{assert.throws(()=>generate([element],{...cfg,up:3}),/抬笔 Z/);assert.throws(()=>generate([element],{...cfg,up:0}),/抬笔 Z/);const code=generate([element],{...cfg,up:-1,down:2});assert.ok(code.includes('G1 Z-1 F100\nG0 X10 Y20\nG1 Z2 F100'));});
