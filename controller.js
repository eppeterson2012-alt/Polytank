(() => {
  "use strict";
  const STORAGE_KEY = "polystar.gamepad.bindings.v2";
  const DEADZONE = 0.18, THRESHOLD = 0.55;
  const actions = [
    ["accelerate","Accelerate","KeyW",0],["brake","Brake","KeyS",1],
    ["left","Steer left","KeyA",14],["right","Steer right","KeyD",15],
    ["checkpoint","Checkpoint reset","KeyR",3],["start","Start reset","KeyT",2],
    ["camera","Cockpit camera","KeyC",9]
  ];
  const defaults = Object.fromEntries(actions.map(([id,,key,index]) => [id,index]));
  let bindings = {...defaults}, activePad = null, captureAction = null;
  const heldKeys = new Set(), previous = new Map();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && typeof saved === "object") for (const [id] of actions)
      if (Number.isInteger(saved[id]) && saved[id] >= 0 && saved[id] < 32) bindings[id] = saved[id];
  } catch (_) {}
  function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(bindings));}catch(_){}}
  function keyEvent(code,type){
    const key=({KeyW:"w",KeyA:"a",KeyS:"s",KeyD:"d",KeyR:"r",KeyT:"t",KeyC:"c"})[code]||code;
    window.dispatchEvent(new KeyboardEvent(type,{code,key,bubbles:true,cancelable:true}));
  }
  function setKey(code,down){
    if(down&&!heldKeys.has(code)){heldKeys.add(code);keyEvent(code,"keydown");}
    else if(!down&&heldKeys.has(code)){heldKeys.delete(code);keyEvent(code,"keyup");}
  }
  function buttonDown(pad,index){
    const b=pad&&pad.buttons&&pad.buttons[index];
    return !!b&&(b.pressed||b.value>=THRESHOLD);
  }
  function releaseAll(){for(const code of [...heldKeys])setKey(code,false);previous.clear();}
  function pressOnce(id,code,down){
    const was=previous.get(id)===true;
    if(down&&!was){keyEvent(code,"keydown");keyEvent(code,"keyup");}
    previous.set(id,down);
  }
  function poll(){
    const pads=navigator.getGamepads?navigator.getGamepads():[];
    activePad=null;
    for(const p of pads)if(p&&p.connected){activePad=p;break;}
    if(!activePad){releaseAll();requestAnimationFrame(poll);return;}
    const axis=activePad.axes[0]||0;
    const state={
      accelerate:buttonDown(activePad,bindings.accelerate),
      brake:buttonDown(activePad,bindings.brake),
      left:buttonDown(activePad,bindings.left)||axis < -DEADZONE,
      right:buttonDown(activePad,bindings.right)||axis > DEADZONE
    };
    for(const [id,,key] of actions.slice(0,4))setKey(key,state[id]);
    for(const [id,,key] of actions.slice(4))pressOnce(id,key,buttonDown(activePad,bindings[id]));
    requestAnimationFrame(poll);
  }
  const names=["A / Cross","B / Circle","X / Square","Y / Triangle","LB / L1","RB / R1","LT / L2","RT / R2","Select / Share","Start / Options","L-stick","R-stick","D-pad Up","D-pad Down","D-pad Left","D-pad Right"];
  function buttonLabel(index){return names[index]||("Button "+index);}
  const style=document.createElement("style");
  style.textContent=[
    "#ps-controller-settings-button{margin:6px 0;padding:7px 11px;border:1px solid #65748a;border-radius:7px;background:#263548;color:#fff;font:600 13px system-ui;cursor:pointer}",
    "#ps-controller-overlay{position:fixed;inset:0;z-index:2147483646;display:none;align-items:center;justify-content:center;padding:16px;background:#000a;font:14px system-ui;color:#f5f7fb}",
    "#ps-controller-overlay.ps-open{display:flex}",
    "#ps-controller-panel{width:min(460px,100%);max-height:85vh;overflow:auto;background:#151d29;border:1px solid #46566b;border-radius:12px;padding:18px;box-shadow:0 18px 60px #0009}",
    "#ps-controller-panel h2{font-size:18px;margin:0 0 7px}",
    "#ps-controller-panel p{color:#c1ccda;font-size:12px;line-height:1.45;margin:0 0 14px}",
    ".ps-bind-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #ffffff18}",
    ".ps-bind-row button,.ps-controller-actions button{min-width:132px;padding:7px 9px;border:1px solid #65748a;border-radius:6px;background:#263548;color:#fff;cursor:pointer}",
    ".ps-bind-row button.ps-listening{background:#73521c;border-color:#d7a64a}",
    ".ps-controller-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}"
  ].join("");
  document.head.appendChild(style);
  const overlay=document.createElement("div");
  overlay.id="ps-controller-overlay";
  const panel=document.createElement("div");
  panel.id="ps-controller-panel";panel.setAttribute("role","dialog");panel.setAttribute("aria-modal","true");
  const title=document.createElement("h2");title.textContent="Controller settings";
  const help=document.createElement("p");help.textContent="Choose a binding, then press the controller button you want to use. The left stick also steers. Changes save automatically in this browser.";
  const rows=document.createElement("div");rows.id="ps-controller-bindings";
  const actionsBar=document.createElement("div");actionsBar.className="ps-controller-actions";
  const reset=document.createElement("button");reset.type="button";reset.textContent="Restore defaults";
  const done=document.createElement("button");done.type="button";done.textContent="Done";
  actionsBar.append(reset,done);panel.append(title,help,rows,actionsBar);overlay.appendChild(panel);document.body.appendChild(overlay);
  function renderBindings(){
    rows.replaceChildren();
    for(const [id,label] of actions){
      const row=document.createElement("div");row.className="ps-bind-row";
      const name=document.createElement("span");name.textContent=label;
      const button=document.createElement("button");button.type="button";
      button.textContent=captureAction===id?"Press a button…":buttonLabel(bindings[id]);
      if(captureAction===id)button.classList.add("ps-listening");
      button.addEventListener("click",()=>{captureAction=id;renderBindings();});
      row.append(name,button);rows.appendChild(row);
    }
  }
  function openSettings(){captureAction=null;renderBindings();overlay.classList.add("ps-open");}
  function closeSettings(){captureAction=null;overlay.classList.remove("ps-open");}
  done.addEventListener("click",closeSettings);
  overlay.addEventListener("click",e=>{if(e.target===overlay)closeSettings();});
  reset.addEventListener("click",()=>{bindings={...defaults};save();renderBindings();});
  function capturePoll(){
    if(!captureAction||!activePad)return;
    for(let i=0;i<activePad.buttons.length;i++){
      const b=activePad.buttons[i];
      if(b&&(b.pressed||b.value>0.75)){
        bindings[captureAction]=i;captureAction=null;save();renderBindings();break;
      }
    }
  }
  function installSettingsEntry(){
    if(document.getElementById("ps-controller-settings-button"))return;
    const candidates=[...document.querySelectorAll("div,span,p,h1,h2,h3")]
      .filter(el=>el.childElementCount===0&&el.textContent.trim()==="Controls"&&el.getClientRects().length);
    if(!candidates.length)return;
    const heading=candidates[candidates.length-1];
    const button=document.createElement("button");button.id="ps-controller-settings-button";
    button.type="button";button.textContent="Controller settings";button.addEventListener("click",openSettings);
    heading.insertAdjacentElement("afterend",button);
  }
  const observer=new MutationObserver(installSettingsEntry);
  observer.observe(document.documentElement,{childList:true,subtree:true});installSettingsEntry();
  function captureLoop(){capturePoll();requestAnimationFrame(captureLoop);}
  window.addEventListener("gamepaddisconnected",releaseAll);
  window.addEventListener("pagehide",releaseAll);
  requestAnimationFrame(poll);requestAnimationFrame(captureLoop);
})();