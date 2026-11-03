// Own each reader/writer lock until it is released, including failed opens.
export class SerialConnection {
 constructor(onLine, onClose) { this.onLine=onLine; this.onClose=onClose; this.port=null; this.reader=null; this.writer=null; this.closing=null; }
 async open(port, baudRate) {
  this.port=port;
  try {
   await port.open({baudRate,dataBits:8,stopBits:1,parity:'none',flowControl:'none'});
   if(!port.readable||!port.writable)throw Error('端口未提供可读写数据流');
   this.writer=port.writable.getWriter();
   this.readTask=this.readLoop();
  } catch(e) { await this.close(); throw e; }
 }
 async write(value) {
  if(!this.writer||this.closing)throw Error('串口未连接');
  await this.writer.write(new TextEncoder().encode(value));
 }
 async readLoop() {
  const decoder=new TextDecoder();let buffer='',failure=null;
  try {
   this.reader=this.port.readable.getReader();
   while(true) {
    const {value,done}=await this.reader.read();if(done)break;
    buffer+=decoder.decode(value,{stream:true});
    if(buffer.length>65536)throw Error('串口接收数据过长，未发现换行');
    let index;
    while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index).trim();buffer=buffer.slice(index+1);this.onLine(line);}
   }
  } catch(e) {failure=e;}
  finally {
   this.reader?.releaseLock();this.reader=null;
   // Do not await close here: close waits for this read task to release its lock.
   if(!this.closing)queueMicrotask(()=>this.close().then(()=>this.onClose(failure)));
  }
 }
 close() {
  if(this.closing)return this.closing;
  this.closing=Promise.resolve().then(async()=>{
   try { if(this.reader)await this.reader.cancel().catch(()=>{});if(this.readTask)await this.readTask;
    if(this.writer){await this.writer.abort().catch(()=>{});this.writer.releaseLock();this.writer=null;}
    if(this.port)await this.port.close().catch(()=>{});
   } finally {this.port=null;}
  });
  return this.closing;
 }
}
export function serialError(e) {
 const raw=`${e.name||'Error'}: ${e.message}`;
 if(e.name==='NotFoundError')return '未选择串口，可重新点击连接。\n'+raw;
 if(e.name==='NetworkError')return '无法打开串口。请关闭占用该端口的串口监视器、烧录工具和其他网页；拔插 USB 后重新选择 ESP32 对应端口。若仍失败，请在设备管理器查看 USB 串口驱动状态。\n'+raw;
 if(e.name==='SecurityError')return '浏览器禁止访问串口。请在独立的桌面 Chrome / Edge 中打开 http://127.0.0.1:5173/，检查网站串口权限。\n'+raw;
 if(e.name==='InvalidStateError')return '串口处于已打开或未释放状态。请断开其他连接该设备的网页，再重新连接。\n'+raw;
 return raw;
}
