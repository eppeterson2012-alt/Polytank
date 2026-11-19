(() => {
  "use strict";
  const STORAGE_KEY = "polystar.gamepad.bindings.v3";
  const DEADZONE = 0.18, ANALOG_PERIOD = 100, STEERING_PERIOD = 40;
  const actions = [
    ["accelerate","Accelerate","KeyW"],
    ["brake","Brake","KeyS"],
    ["left","Steer left","KeyA"],
    ["right","Steer right","KeyD"],
    ["checkpoint","Checkpoint reset","KeyR"],
    ["start","Start reset","KeyT"],
    ["camera","Cockpit camera","KeyC"]
  ];
  const settingsActions = [...actions, ["steering","Steering (analog)",null]];
  const defaults = {
    accelerate:{type:"button",index:7},
    brake:{type:"button",index:6},
    left:{type:"axis",index:0,rest:0,end:-1},
    right:{type:"axis",index:0,rest:0,end:1},
    checkpoint:{type:"button",index:3},
    start:{type:"button",index:2},
    camera:{type:"button",index:9},
    steering:{type:"analogAxis",index:0,rest:0}
  };
  let bindings=structuredClone(defaults),activePad=null,captureAction=null,captureBaseline=null,steeringCurve=1.6;
  const heldKeys=new Set(),previous=new Map();
  try {
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");
    if(saved&&typeof saved==="object")for(const [id] of actions){
      const v=saved[id];
      if(v&&v.type==="button"&&Number.isInteger(v.index)&&v.index>=0&&v.index<64)bindings[id]={type:"button",index:v.index};
      else if(v&&v.type==="axis"&&Number.isInteger(v.index)&&v.index>=0&&v.index<16&&Number.isFinite(v.rest)&&Number.isFinite(v.end)&&v.rest!==v.end)bindings[id]={type:"axis",index:v.index,rest:v.rest,end:v.end};
      // Migrate previous versions, which stored button numbers only.
      else if(Number.isInteger(v)&&v>=0&&v<32)bindings[id]={type:"button",index:v};
    }
    if(saved&&Number.isFinite(saved.steeringCurve))steeringCurve=Math.max(0.5,Math.min(3,saved.steeringCurve));
    const steer=saved&&saved.steering;
    if(steer&&steer.type==="analogAxis"&&Number.isInteger(steer.index)&&steer.index>=0&&steer.index<16&&Number.isFinite(steer.rest))bindings.steering={type:"analogAxis",index:steer.index,rest:steer.rest};
  }catch(_){}
  function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify({...bindings,steeringCurve}));}catch(_){}}
  function keyEvent(code,type){
    const key=({KeyW:"w",KeyA:"a",KeyS:"s",KeyD:"d",KeyR:"r",KeyT:"t",KeyC:"c"})[code]||code;
    window.dispatchEvent(new KeyboardEvent(type,{code,key,bubbles:true,cancelable:true}));
  }
  function setKey(code,down){
    if(down&&!heldKeys.has(code)){heldKeys.add(code);keyEvent(code,"keydown");}
    else if(!down&&heldKeys.has(code)){heldKeys.delete(code);keyEvent(code,"keyup");}
  }
  function clamp(v){return Math.max(0,Math.min(1,v));}
  function buttonValue(pad,index){
    const b=pad&&pad.buttons&&pad.buttons[index];
    return b?clamp(Number.isFinite(b.value)?b.value:(b.pressed?1:0)):0;
  }
  function readBinding(pad,binding){
    if(!binding||!pad)return 0;
    if(binding.type==="button")return buttonValue(pad,binding.index);
    const raw=pad.axes[binding.index];
    if(!Number.isFinite(raw))return 0;
    return clamp((raw-binding.rest)/(binding.end-binding.rest));
  }
  function readSteering(pad,binding){
    if(!pad||!binding||binding.type!=="analogAxis")return 0;
    const raw=pad.axes[binding.index];
    if(!Number.isFinite(raw))return 0;
    const delta=raw-binding.rest;
    const range=delta<0?Math.max(0.01,1+binding.rest):Math.max(0.01,1-binding.rest);
    const value=Math.max(-1,Math.min(1,delta/range));
    if(Math.abs(value)<0.12)return 0;
    return Math.sign(value)*Math.pow((Math.abs(value)-0.12)/0.88,steeringCurve);
  }
  function analogSteerPressed(value,now){
    const amount=Math.abs(value);
    if(amount<0.01)return false;
    if(amount>=0.98)return true;
    return (now%STEERING_PERIOD)<amount*STEERING_PERIOD;
  }
  function analogPressed(value,now){
    if(value<0.02)return false;
    if(value>=0.98)return true;
    return (now%ANALOG_PERIOD)<value*ANALOG_PERIOD;
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
    const now=performance.now();
    const accel=readBinding(activePad,bindings.accelerate);
    const brake=readBinding(activePad,bindings.brake);
    const left=readBinding(activePad,bindings.left);
    const right=readBinding(activePad,bindings.right);
    const steering=readSteering(activePad,bindings.steering);
    const state={
      accelerate:analogPressed(accel,now),
      brake:analogPressed(brake,now),
      left:bindings.steering?steering<0&&analogSteerPressed(steering,now):left>DEADZONE,
      right:bindings.steering?steering>0&&analogSteerPressed(steering,now):right>DEADZONE
    };
    for(const [id,,key] of actions.slice(0,4))setKey(key,state[id]);
    for(const [id,,key] of actions.slice(4))pressOnce(id,key,readBinding(activePad,bindings[id])>0.55);
    requestAnimationFrame(poll);
  }
  const buttonNames=["A / Cross","B / Circle","X / Square","Y / Triangle","LB / L1","RB / R1","LT / L2","RT / R2","Select / Share","Start / Options","L-stick click","R-stick click","D-pad Up","D-pad Down","D-pad Left","D-pad Right"];
  function bindingLabel(b){
    if(!b)return "Not assigned";
    if(b.type==="button")return buttonNames[b.index]||("Button "+b.index);
    if(b.type==="analogAxis")return "Axis "+(b.index+1)+" (analog)";
    return "Axis "+(b.index+1)+" "+(b.end>b.rest?"positive":"negative");
  }
  let settingsContainer=null,gamepadHeading=null,curveRow=null,curveSlider=null,curveValue=null,resetRow=null,mappingRows=[];
  function renderBindings(){
    if(!settingsContainer)return;
    for(const row of mappingRows)row.remove();
    mappingRows=[];
    for(const [id,label] of settingsActions){
      const row=document.createElement("div");row.className="setting key-binding";
      const name=document.createElement("p");name.textContent=label;
      const button=document.createElement("button");button.type="button";
      button.textContent=captureAction===id?"Press or move control…":bindingLabel(bindings[id]);
      if(captureAction===id)button.classList.add("selected");
      button.addEventListener("click",()=>{
        captureAction=id;
        captureBaseline=activePad?Array.from(activePad.axes):null;
        renderBindings();
      });
      const wrapper=document.createElement("div");wrapper.className="button-wrapper";
      wrapper.appendChild(button);row.append(name,wrapper);mappingRows.push(row);
    }
    curveValue.textContent=steeringCurve.toFixed(1);
    curveSlider.value=String(steeringCurve);
    const anchor=resetRow;
    for(const row of mappingRows)settingsContainer.insertBefore(row,anchor);
  }
  function installSettings(){
    const menu=document.querySelector(".settings-menu-ui");
    const container=menu&&menu.querySelector(":scope > .container");
    if(!container)return;
    settingsContainer=container;
    if(document.getElementById("ps-gamepad-settings-heading")?.parentElement===container)return;
    document.getElementById("ps-gamepad-settings-heading")?.remove();
    document.getElementById("ps-gamepad-curve-row")?.remove();
    document.getElementById("ps-gamepad-reset-row")?.remove();
    gamepadHeading=document.createElement("h3");gamepadHeading.id="ps-gamepad-settings-heading";gamepadHeading.textContent="Gamepad";
    curveRow=document.createElement("div");curveRow.id="ps-gamepad-curve-row";curveRow.className="setting";
    const curveLabel=document.createElement("p");curveLabel.textContent="Steering curve";
    curveSlider=document.createElement("input");curveSlider.type="range";
    curveSlider.min="0.5";curveSlider.max="3";curveSlider.step="0.1";curveSlider.value=String(steeringCurve);
    curveValue=document.createElement("span");curveValue.style.cssText="align-self:center;margin:0 12px;color:var(--text-color);font-size:22px;min-width:36px;text-align:right";
    curveSlider.addEventListener("input",()=>{
      steeringCurve=Number(curveSlider.value);
      curveValue.textContent=steeringCurve.toFixed(1);
      save();
    });
    const curveWrap=document.createElement("div");curveWrap.style.cssText="display:flex;align-items:center;gap:8px";
    curveWrap.append(curveSlider,curveValue);curveRow.append(curveLabel,curveWrap);
    resetRow=document.createElement("div");resetRow.id="ps-gamepad-reset-row";resetRow.className="setting";
    const resetLabel=document.createElement("p");resetLabel.textContent="Controller mappings";
    const resetButton=document.createElement("button");resetButton.type="button";resetButton.textContent="Restore defaults";
    resetButton.addEventListener("click",()=>{
      bindings=structuredClone(defaults);save();renderBindings();
    });
    const resetWrap=document.createElement("div");resetWrap.className="button-wrapper";
    resetWrap.appendChild(resetButton);resetRow.append(resetLabel,resetWrap);
    const editorHeading=[...container.querySelectorAll(":scope > h3")].find(el=>el.textContent.trim()==="Editor");
    container.insertBefore(gamepadHeading,editorHeading||null);
    container.insertBefore(curveRow,editorHeading||null);
    container.insertBefore(resetRow,editorHeading||null);
    renderBindings();
  }
  const observer=new MutationObserver(installSettings);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  installSettings();
  function capturePoll(){
    if(!captureAction||!activePad)return;
    // Analog steering captures the stick axis and its neutral center.
    if(captureAction==="steering"){
      for(let i=0;i<activePad.axes.length;i++){
        const value=activePad.axes[i];
        const base=captureBaseline&&Number.isFinite(captureBaseline[i])?captureBaseline[i]:0;
        if(Math.abs(value-base)>0.35){
          bindings.steering={type:"analogAxis",index:i,rest:base};
          captureAction=null;captureBaseline=null;save();renderBindings();return;
        }
      }
      return;
    }
    // Prefer axes before buttons: some controllers expose analog triggers
    // as axes, and may also report a related button value.
    for(let i=0;i<activePad.axes.length;i++){
      const value=activePad.axes[i];
      const base=captureBaseline&&Number.isFinite(captureBaseline[i])?captureBaseline[i]:0;
      const delta=value-base;
      if(Math.abs(delta)>0.45){
        bindings[captureAction]={type:"axis",index:i,rest:base,end:base+Math.sign(delta)};
        captureAction=null;captureBaseline=null;save();renderBindings();return;
      }
    }
    for(let i=0;i<activePad.buttons.length;i++){
      if(buttonValue(activePad,i)>0.55){
        bindings[captureAction]={type:"button",index:i};
        captureAction=null;captureBaseline=null;save();renderBindings();return;
      }
    }
  }
  function captureLoop(){capturePoll();requestAnimationFrame(captureLoop);}
  window.addEventListener("gamepaddisconnected",releaseAll);
  window.addEventListener("pagehide",releaseAll);
  requestAnimationFrame(poll);requestAnimationFrame(captureLoop);
})();