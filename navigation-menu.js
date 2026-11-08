/* V4.7.2 navigation menu: no route/GPS changes. */
(()=>{'use strict';
 const panel=document.getElementById('info-panel');
 const closeButton=document.getElementById('nav-panel-close');
 const menuButtons=Array.from(document.querySelectorAll('.nav-menu-button'));
 function setOpen(open){
   const active=document.body.classList.contains('nav-active');
   document.body.classList.toggle('menu-open',Boolean(open&&active));
   const shown=document.body.classList.contains('menu-open');
   menuButtons.forEach(b=>{b.setAttribute('aria-expanded',String(shown));b.textContent=shown?'✕ Menu':'☰ Menu';});
   if(shown){panel.scrollTop=0;}
 }
 menuButtons.forEach(b=>b.addEventListener('click',()=>setOpen(!document.body.classList.contains('menu-open'))));
 closeButton.addEventListener('click',()=>setOpen(false));
 document.addEventListener('keydown',e=>{if(e.key==='Escape')setOpen(false);});
 const observer=new MutationObserver(()=>{if(!document.body.classList.contains('nav-active')&&document.body.classList.contains('menu-open'))setOpen(false);});
 observer.observe(document.body,{attributes:true,attributeFilter:['class']});
})();
