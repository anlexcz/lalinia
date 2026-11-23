"use strict";
// OpenFreeMap Liberty + stejné minimalistické barevné ladění jako Zastávkobraní.
const MAP_COLORS=Object.freeze({background:'#181a1c',water:'#303a3e',park:'#252c29',street:'#41464b',mainRoad:'#51565a',path:'#303539',railway:'#85898d',tram:'#969a9c',text:'#aeb0b2'});
function applyGameMapStyle(map){
 const layers=map.getStyle()?.layers||[];
 const set=(id,key,val)=>map.setPaintProperty(id,key,val);
 const hide=id=>map.setLayoutProperty(id,'visibility','none');
 for(const layer of layers){
   const id=layer.id,name=id.toLowerCase(),cat=name+' '+String(layer['source-layer']||'').toLowerCase(),paint=layer.paint||{};
   if(paint['fill-pattern']!==undefined||paint['line-pattern']!==undefined||/hatch|pattern/.test(name)){hide(id);continue;}
   if(/building|housenumber|poi|aeroway|airport|mountain_peak|transit_stop/.test(cat)){hide(id);continue;}
   if(layer.type==='background'){set(id,'background-color',MAP_COLORS.background);continue;}
   if(layer.type==='fill'){
     const c=/water/.test(cat)?MAP_COLORS.water:/park|landcover|landuse|wood|grass|forest|cemetery/.test(cat)?MAP_COLORS.park:MAP_COLORS.background;
     set(id,'fill-color',c);continue;
   }
   if(layer.type==='line'){
     if(/casing|outline|hatching|dash/.test(name)&&/tunnel/.test(name)){hide(id);continue;}
     const tunnel=/tunnel/.test(name);
     const c=/tram/.test(name)?MAP_COLORS.tram:/rail|subway|transit/.test(name)?MAP_COLORS.railway:/water/.test(cat)?MAP_COLORS.water:/motorway|trunk|primary|secondary|highway/.test(name)?MAP_COLORS.mainRoad:/path|foot|cycle|pedestrian|service/.test(name)?MAP_COLORS.path:MAP_COLORS.street;
     set(id,'line-color',c);
     set(id,'line-opacity',tunnel?.12:/tram/.test(name)?.95:/rail|subway|transit/.test(name)?.85:/path|foot|cycle|pedestrian|service/.test(name)?.5:.7);
     continue;
   }
   if(layer.type==='symbol'){
      if(/place|city|town|suburb|neighbourhood|street|road|transportation_name/.test(cat)&&!/poi|stop|housenumber/.test(name)){
        if(layer.layout?.['icon-image'])map.setLayoutProperty(id,'icon-image','');
        if(layer.paint?.['text-color']!==undefined)set(id,'text-color',MAP_COLORS.text);
        if(layer.paint?.['text-halo-color']!==undefined)set(id,'text-halo-color',MAP_COLORS.background);
      }else hide(id);
      continue;
   }
   if(layer.type==='fill-extrusion')hide(id);
 }
}
