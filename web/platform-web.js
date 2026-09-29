/* Web platform for Home Bar: Supabase sign-in and storage, Claude through /api/claude.
   Loaded before the app. Sets window.HB_PLATFORM, which the app uses instead of the
   claude.ai artifact capabilities. Config comes from window.HB_CONFIG (written at build). */
(function(){
  const cfg=window.HB_CONFIG||{};
  const sb=cfg.supabaseUrl&&cfg.supabaseAnonKey&&window.supabase?window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey):null;

  async function session(){
    if(!sb)return null;
    const {data}=await sb.auth.getSession();
    return data.session;
  }
  function toDataUrl(blob){
    return new Promise((ok,bad)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=bad;r.readAsDataURL(blob)});
  }

  window.HB_PLATFORM={
    name:"web",
    async ai(){
      return {json:async(task,params,opts={})=>{
        const s=await session();
        if(!s)throw {code:"login_required"};
        const images=await Promise.all((opts.images||[]).map(toDataUrl));
        let r;
        try{
          r=await fetch("/api/claude",{method:"POST",signal:opts.signal,
            headers:{"content-type":"application/json",authorization:"Bearer "+s.access_token},
            body:JSON.stringify({task,params,images})});
        }catch(e){throw {code:e&&e.name==="AbortError"?"cancelled":"upstream_error"}}
        const body=await r.json().catch(()=>({}));
        if(!r.ok)throw {code:body.code||"upstream_error",message:body.message||""};
        return body;
      }};
    },
    async bar(){
      const s=await session();
      if(!s)return null;
      const uid=s.user.id;
      return {legacy:null,ref:{
        async get(){
          const {data,error}=await sb.from("bars").select("data").eq("user_id",uid).maybeSingle();
          if(error)throw error;
          return {exists:!!data,data:()=>data&&data.data};
        },
        async set(d){
          const {error}=await sb.from("bars").upsert({user_id:uid,data:d,updated_at:new Date().toISOString()});
          if(error)throw error;
        },
        // Live updates when the same person edits on another device.
        onSnapshot(fn){
          const ch=sb.channel("bar-"+uid)
            .on("postgres_changes",{event:"*",schema:"public",table:"bars",filter:"user_id=eq."+uid},
              p=>{if(p.new&&p.new.data)fn({exists:true,data:()=>p.new.data})})
            .subscribe();
          return ()=>sb.removeChannel(ch);
        }
      }};
    }
  };

  /* ---- sign-in UI: the header's save indicator becomes the account button ---- */
  if(!sb)return;
  const css=document.createElement("style");
  css.textContent=".acct{position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.45);display:grid;place-items:center;padding:16px}"+
    ".acct .card{max-width:380px;width:100%;display:grid;gap:12px}.acct h2{margin:0;font-family:var(--display);font-weight:400}"+
    ".acct input{width:100%;font:16px var(--body);padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--ink)}"+
    "#sync{cursor:pointer}#sync .who{font-weight:700;color:var(--accent)}";
  document.head.appendChild(css);

  function dialog(){
    const wrap=document.createElement("div");wrap.className="acct";wrap.dir="rtl";
    wrap.innerHTML='<form class="card"><h2>התחברות</h2><p class="note" style="margin:0">הבר נשמר בחשבון שלך ומסתנכרן בין מכשירים.</p>'+
      '<button class="btn" type="button" data-google>המשך עם Google</button>'+
      '<label class="lbl" for="acct-email">או קישור כניסה במייל</label><input id="acct-email" type="email" required placeholder="name@example.com" autocomplete="email">'+
      '<button class="btn ghost" type="submit">שליחת קישור</button><p class="status" data-msg></p>'+
      '<button class="ob-skip" type="button" data-close>סגירה</button></form>';
    const msg=wrap.querySelector("[data-msg]");
    wrap.querySelector("[data-close]").onclick=()=>wrap.remove();
    wrap.addEventListener("click",e=>{if(e.target===wrap)wrap.remove()});
    wrap.querySelector("[data-google]").onclick=()=>sb.auth.signInWithOAuth({provider:"google",options:{redirectTo:location.origin}});
    wrap.querySelector("form").onsubmit=async e=>{
      e.preventDefault();
      const email=wrap.querySelector("#acct-email").value.trim();
      const {error}=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin}});
      msg.textContent=error?"לא הצלחנו לשלוח. בדקו את הכתובת ונסו שוב.":"שלחנו קישור ל-"+email+". פתחו אותו מהמכשיר הזה.";
    };
    document.body.appendChild(wrap);wrap.querySelector("input").focus();
  }

  async function paintAccount(){
    const s=await session(),el=document.getElementById("sync");if(!el)return;
    el.title=s?"התנתקות":"התחברות";
    if(!s){const t=document.getElementById("syncText");if(t)t.textContent="שמור בדפדפן הזה · התחברות"}
    el.onclick=async()=>{
      if(!s)return dialog();
      await sb.auth.signOut();location.reload();
    };
  }
  sb.auth.onAuthStateChange((event)=>{if(event==="SIGNED_IN"&&!sessionStorage.getItem("hb-signed")){sessionStorage.setItem("hb-signed","1");location.reload()}});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",paintAccount);else paintAccount();
})();
