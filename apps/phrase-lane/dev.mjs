import http from 'node:http';
import worker from './dist/worker.mjs';
const env={};
http.createServer(async(req,res)=>{const url='http://localhost:8787'+req.url;const chunks=[];for await(const chunk of req)chunks.push(chunk);const r=await worker.fetch(new Request(url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)}),env,{});res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));}).listen(8787,()=>console.log('Static preview: http://localhost:8787. Use wrangler dev for AI/D1 bindings.'));
