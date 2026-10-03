/* Web platform for All Cohol: Supabase sign-in and storage, Claude through /api/claude.
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
  // Text in the page's current language, from the app's locales (src/i18n).
  function tr(key,...args){
    const all=window.HB_LOCALES||{},L=all[document.documentElement.lang]||all.he;
    const v=L&&key in L.ui?L.ui[key]:all.en&&all.en.ui[key];
    return typeof v==="function"?v(...args):(v??key);
  }
  function toDataUrl(blob){
    return new Promise((ok,bad)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=bad;r.readAsDataURL(blob)});
  }

  window.HB_PLATFORM={
    name:"web",
    async ai(){
      if(!cfg.ai)return null; // no Claude key on the server yet: the app hides Claude features
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

  /* ---- sign-in: the app opens behind a welcome screen until the person signs in ---- */
  if(!sb)return;
  const css=document.createElement("style");
  css.textContent=
    "html.hb-gate body>.app,html.hb-gate body>.ob{visibility:hidden}"+
    ".gate{position:fixed;inset:0;z-index:70;background:var(--bg);color:var(--ink);overflow-y:auto;padding:env(safe-area-inset-top,0px) 26px env(safe-area-inset-bottom,0px)}"+
    ".gate-in{max-width:440px;margin:0 auto;min-height:100%;display:flex;flex-direction:column;gap:14px;padding-block:18px 40px}"+
    ".gate-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:auto;padding-bottom:40px}"+
    ".gate-top svg{width:40px;height:40px;border-radius:10px}"+
    ".gate h1{font:600 clamp(72px,24vw,92px)/.86 var(--display);text-transform:uppercase;letter-spacing:-.01em;margin:0;white-space:normal;font-synthesis:none}"+
    ".gate h2{font:600 44px/.92 var(--display);text-transform:uppercase;margin:0;font-synthesis:none}"+
    ".gate .motto{font:italic 400 22px/1.3 var(--serif);color:var(--ink2);margin:0}"+
    "html[lang=he] .gate .motto{font-style:normal}"+
    ".gate .lead{margin:4px 0 0;color:var(--muted);font-size:17px;line-height:1.45;text-wrap:pretty}"+
    ".gate form{display:grid;gap:12px;margin-top:18px}"+
    ".gate label{font:500 11px var(--display);letter-spacing:var(--track);text-transform:uppercase;color:var(--muted)}"+
    ".gate input{width:100%;font:17px var(--body);padding:14px 16px;border:1px solid var(--line2);border-radius:12px;background:var(--surface);color:var(--ink)}"+
    ".gate input.code{font-size:24px;letter-spacing:.3em;text-align:center;direction:ltr}"+
    ".gate .btn{min-height:52px;font-size:16px;width:100%}.gate .btn:disabled{opacity:.6}"+
    ".gate .btn.ghost{border-color:var(--ink)}"+
    ".gate .row{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}"+
    ".gate .link{border:0;background:none;color:var(--gold);font:600 14px var(--body);cursor:pointer;padding:8px;min-height:40px}"+
    ".gate .or{display:flex;align-items:center;gap:12px;color:var(--muted);font-size:13px}.gate .or::before,.gate .or::after{content:'';flex:1;border-top:1px solid var(--line)}"+
    ".gate .err{color:var(--warn);font-size:14px;margin:0;min-height:1.2em}"+
    ".gate .note{font-size:13px;color:var(--muted);text-align:center;margin:0}"+
    "#sync{cursor:pointer}";
  document.head.appendChild(css);
  document.documentElement.classList.add("hb-gate"); // hide the app until we know who this is

  let step={name:"email",email:""};
  function gate(){
    let g=document.getElementById("gate");
    if(!g){g=document.createElement("div");g.id="gate";g.className="gate";g.setAttribute("role","dialog");g.setAttribute("aria-modal","true");document.body.appendChild(g)}
    const lb=document.getElementById("langBtn");
    const logo=document.querySelector(".brand svg");
    g.innerHTML='<div class="gate-in"><div class="gate-top"><span data-logo></span><button type="button" class="lang-btn" data-lang></button></div><div data-body style="display:grid;gap:14px"></div></div>';
    if(logo)g.querySelector("[data-logo]").append(logo.cloneNode(true));
    g.querySelector("[data-lang]").textContent=lb?lb.textContent:"";
    g.querySelector("[data-lang]").onclick=()=>{if(lb)lb.click()}; // the app switches language and fires hb-lang
    const body=g.querySelector("[data-body]");
    const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e};
    if(step.name==="email"){
      const h=el("h1");h.append(tr("app.h1a").trim(),document.createElement("br"),tr("app.h1b"));
      body.append(el("div","eyebrow gold",tr("gate.eyebrow")),h,el("p","motto",tr("app.motto")),el("p","lead",tr("gate.lead")));
      if(cfg.google){
        const gb=el("button","btn ghost",tr("acct.google"));gb.type="button";
        gb.onclick=()=>sb.auth.signInWithOAuth({provider:"google",options:{redirectTo:location.origin}});
        body.append(gb,el("div","or",tr("gate.or")));
      }
      const f=el("form");const lab=el("label",null,tr("gate.emailLabel"));lab.htmlFor="gate-email";
      const inp=el("input");inp.id="gate-email";inp.type="email";inp.required=true;inp.autocomplete="email";inp.inputMode="email";inp.placeholder="name@example.com";inp.value=step.email;
      const btn=el("button","btn",tr("gate.send"));btn.type="submit";const msg=el("p","err");
      f.append(lab,inp,btn,msg);
      f.onsubmit=async e=>{e.preventDefault();btn.disabled=true;btn.textContent=tr("gate.sending");
        const email=inp.value.trim();const {error}=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin}});
        btn.disabled=false;btn.textContent=tr("gate.send");
        if(error){msg.textContent=error.status===429?tr("gate.tooMany"):tr("acct.sendFailed");return}
        step={name:"code",email};gate();};
      body.append(f,el("p","note",tr("gate.note")));
      setTimeout(()=>inp.focus(),0);
    }else{
      body.append(el("h2",null,tr("gate.checkTitle")),el("p","lead",tr("gate.checkLead",step.email)));
      const f=el("form");const lab=el("label",null,tr("gate.codeLabel"));lab.htmlFor="gate-code";
      const inp=el("input","code");inp.id="gate-code";inp.inputMode="numeric";inp.autocomplete="one-time-code";inp.maxLength=10;inp.required=true;
      const btn=el("button","btn",tr("gate.verify"));btn.type="submit";const msg=el("p","err");
      f.append(lab,inp,btn,msg);
      f.onsubmit=async e=>{e.preventDefault();btn.disabled=true;
        const {error}=await sb.auth.verifyOtp({email:step.email,token:inp.value.replace(/\D/g,""),type:"email"});
        btn.disabled=false;if(error){msg.textContent=tr("gate.badCode");return} // success reloads through onAuthStateChange
      };
      const row=el("div","row");
      const again=el("button","link",tr("gate.resend"));again.type="button";
      again.onclick=async()=>{const {error}=await sb.auth.signInWithOtp({email:step.email,options:{emailRedirectTo:location.origin}});msg.textContent=error?(error.status===429?tr("gate.tooMany"):tr("acct.sendFailed")):"✓"};
      const other=el("button","link",tr("gate.otherEmail"));other.type="button";other.onclick=()=>{step={name:"email",email:""};gate()};
      row.append(again,other);
      body.append(f,row);
      setTimeout(()=>inp.focus(),0);
    }
  }

  // Signed in: the save indicator signs out, with a second tap to confirm.
  async function paintAccount(){
    const s=await session(),el=document.getElementById("sync");
    if(!s){gate();return}
    document.documentElement.classList.remove("hb-gate");
    sessionStorage.removeItem("hb-reloaded");
    const old=document.getElementById("gate");if(old)old.remove();
    if(!el)return;
    el.title=tr("acct.signOut")+" · "+(s.user.email||"");
    let armed=null;
    el.onclick=async()=>{
      const t=document.getElementById("syncText");
      if(!armed){const before=t?t.textContent:"";if(t)t.textContent=tr("acct.signOutConfirm");armed=setTimeout(()=>{armed=null;if(t)t.textContent=before},4000);return}
      clearTimeout(armed);await sb.auth.signOut();location.reload();
    };
  }
  // Just signed in (code, email link or Google): reload once so the app starts with the account's bar.
  // The flag stops a second reload if the event repeats while the page is loading.
  sb.auth.onAuthStateChange((event)=>{
    if(event==="SIGNED_IN"&&document.documentElement.classList.contains("hb-gate")&&!sessionStorage.getItem("hb-reloaded")){
      sessionStorage.setItem("hb-reloaded","1");location.reload();
    }
  });
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",paintAccount);else paintAccount();
  window.addEventListener("hb-lang",()=>{if(document.getElementById("gate"))gate();else paintAccount()}); // the app switched language
})();
