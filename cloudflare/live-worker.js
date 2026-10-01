/**
 * BG Automation Live API — Cloudflare Worker
 * Bind secret GH_TOKEN (fine-grained PAT: Actions: Read-only on configured repos).
 * Optional vars: ALLOWED_ORIGIN=https://bgsarkariresult.github.io
 */
const CONFIG_URL = "https://raw.githubusercontent.com/bgsarkariresult/BG-Automation/main/config.json";
const API = "https://api.github.com";
const headers = { "Accept":"application/vnd.github+json", "X-GitHub-Api-Version":"2022-11-28" };
function cors(origin, allowed) {
  const ok = origin === allowed;
  return {
    "Access-Control-Allow-Origin": ok ? origin : allowed,
    "Access-Control-Allow-Methods":"GET, OPTIONS",
    "Access-Control-Allow-Headers":"Content-Type",
    "Vary":"Origin"
  };
}
export default {
 async fetch(request, env, ctx) {
  const origin=request.headers.get("Origin")||"";
  const allowed=env.ALLOWED_ORIGIN||"https://bgsarkariresult.github.io";
  const ch=cors(origin,allowed);
  if(request.method==="OPTIONS") return new Response(null,{status:204,headers:ch});
  const url=new URL(request.url);
  if(request.method!=="GET"||url.pathname!=="/api/status")
    return new Response(JSON.stringify({ok:false,error:"Not found"}),{status:404,headers:{...ch,"Content-Type":"application/json"}});
  if(origin && origin!==allowed) return new Response("Forbidden",{status:403,headers:ch});
  if(!env.GH_TOKEN) return new Response(JSON.stringify({ok:false,error:"GH_TOKEN secret is not configured"}),{status:503,headers:{...ch,"Content-Type":"application/json"}});
  const cache= caches.default;
  const cacheKey=new Request(new URL("/api/status",url.origin).toString(),{method:"GET"});
  const cached=await cache.match(cacheKey);
  if(cached) return new Response(cached.body,{status:cached.status,headers:{...Object.fromEntries(cached.headers),...ch,"X-Live-Cache":"HIT"}});
  try {
   const h={...headers,"Authorization":"Bearer "+env.GH_TOKEN};
   const cfgRes=await fetch(CONFIG_URL,{headers:{"Accept":"application/vnd.github+json"}});
   if(!cfgRes.ok) throw new Error("Could not load dashboard config: "+cfgRes.status);
   const cfg=await cfgRes.json();
   const bots=await Promise.all((cfg.bots||[]).map(async b=>{
    const base=API+"/repos/"+b.repo+"/actions/";
    const path=b.workflow?"workflows/"+encodeURIComponent(b.workflow)+"/runs":"runs";
    const r=await fetch(base+path+"?per_page=20",{headers:h});
    if(!r.ok) return {...b,status:"api_error",runs:[],api_error:"GitHub API "+r.status};
    const data=await r.json();
    const runs=(data.workflow_runs||[]).map(x=>({
     id:x.id,number:x.run_number,s:x.conclusion||x.status,t:x.updated_at,
     started:x.run_started_at,created:x.created_at,
     d:x.run_started_at?Math.max(0,Math.floor((new Date(x.updated_at)-new Date(x.run_started_at))/1000)):0,
     e:x.event,n:x.display_title||x.name,branch:x.head_branch,
     actor:x.actor?.login||"",u:x.html_url
    }));
    const row={...b,status:runs[0]?.s||"unknown",runs};
    const failed=runs.find(x=>x.s==="failure");
    if(failed){
      const jr=await fetch(base+"runs/"+failed.id+"/jobs?per_page=100",{headers:h});
      if(jr.ok){
       const jobs=(await jr.json()).jobs||[];
       for(const j of jobs){const step=(j.steps||[]).find(s=>s.conclusion==="failure");if(step){row.failed={job:j.name,step:step.name,message:"Workflow step failed: "+step.name,url:failed.u,t:failed.t,run_id:failed.id};break}}
      }
    }
    return row;
   }));
   const body=JSON.stringify({ok:true,source:"GitHub Actions REST API",updated:new Date().toISOString(),bots});
   const response=new Response(body,{headers:{...ch,"Content-Type":"application/json; charset=utf-8","Cache-Control":"public, max-age=15","X-Live-Cache":"MISS"}});
   ctx.waitUntil(cache.put(cacheKey,response.clone()));
   return response;
  } catch(e) {
   return new Response(JSON.stringify({ok:false,error:String(e.message||e)}),{status:502,headers:{...ch,"Content-Type":"application/json"}});
  }
 }
};
