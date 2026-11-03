import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SerialConnection,serialError} from '../src/serial.js';
test('failed open releases port and keeps original error',async()=>{
 let closed=0;const failure=new DOMException('Failed to open serial port.','NetworkError');
 const c=new SerialConnection(()=>{},()=>{});
 await assert.rejects(c.open({open:async()=>{throw failure;},close:async()=>{closed++;}},115200),e=>e===failure);
 assert.equal(closed,1);assert.equal(c.port,null);assert.match(serialError(failure),/占用/);
});
test('close cancels read before closing port and is idempotent',async()=>{
 let controller,closed=0;const lines=[],sent=[];
 const readable=new ReadableStream({start(c){controller=c;}});
 const writable=new WritableStream({write(data){sent.push(new TextDecoder().decode(data));}});
 const port={readable,writable,open:async options=>assert.equal(options.flowControl,'none'),close:async()=>{assert.equal(readable.locked,false);assert.equal(writable.locked,false);closed++;}};
 const c=new SerialConnection(s=>lines.push(s),()=>assert.fail('intentional close should not emit disconnect'));
 await c.open(port,115200);controller.enqueue(new TextEncoder().encode('o'));controller.enqueue(new TextEncoder().encode('k\r\n<Idle>\n'));
 await c.write('?');await new Promise(r=>setTimeout(r,0));assert.deepEqual(lines,['ok','<Idle>']);assert.deepEqual(sent,['?']);
 await Promise.all([c.close(),c.close()]);assert.equal(closed,1);
});
test('failure acquiring reader closes an already acquired writer',async()=>{
 let closed=0;const writable=new WritableStream();const c=new SerialConnection(()=>{},()=>{});
 const port={open:async()=>{},readable:{getReader(){throw Error('read failed');}},writable,close:async()=>{closed++;}};
 await c.open(port,115200);await new Promise(r=>setTimeout(r,0));await c.close();
 assert.equal(writable.locked,false);assert.equal(closed,1);
});
