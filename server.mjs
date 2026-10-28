import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const root=fileURLToPath(new URL('.',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.wasm':'application/wasm','.task':'application/octet-stream'};
const port=Number(process.env.PORT||5173);
createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    const requested=decodeURIComponent(url.pathname);
    const path=resolve(root,'.'+(requested==='/'?'/index.html':requested));
    const rel=relative(root,path);
    if(rel.startsWith('..')||isAbsolute(rel)){res.writeHead(403);res.end('Forbidden');return;}
    const file=await stat(path);if(!file.isFile())throw new Error('Not a file');
    res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    if(req.method==='HEAD')res.end();else res.end(await readFile(path));
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('文件不存在');}
}).listen(port,'127.0.0.1',()=>{
  console.log(`\n灯下 · 皮影\n打开 http://localhost:${port}\n按 Ctrl+C 停止服务器。\n`);
  if(process.argv.includes('--open')&&process.platform==='win32'){
    spawn('rundll32.exe',['url.dll,FileProtocolHandler',`http://localhost:${port}`],{windowsHide:true,stdio:'ignore'}).unref();
  }
}).on('error',error=>{
  console.error(error.code==='EADDRINUSE'?`端口 ${port} 已占用。如果戏台已经运行，请直接打开 http://localhost:${port}。`:error.message);
  process.exitCode=1;
});
