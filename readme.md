### todo
 - fix then animate progress bar
   - portion in parseMap is not working because of busy thread, fix this somehow without retard async forced slowdown bullshit
     - maybe webworker that gets report of progress status and updates dom on it's own? unless more efficient method would be to parse map with webworker... tbd

 - fix texture offsets / scaling, still not 100% correct ( on quake maps only i think, but maybe both. verify with trenchbroom / J.A.C.K. )

 - make loading/parsing & running faster
   - more async ?
   - profile site w ff dev ed

 - make better movement controller that incorporates delta time AND works w touch controls ( mayb onscreen ? idk )
   - unless its okay on mobile ( this should be tested alr )
   - if it doesn't work well, copy [this](https://github.com/sbuggay/bspview/blob/master/src/CameraControls.ts) and add onscreen control/joystick as well as keybound ctls

 - add hideable keybind list somewhere ( top / bottom right )

 - clean all this fucking code its a mess ( split up the functionality as much as possible )
   - no functions longer than 60 lines, no wider than 80-90 chars
   - make sure all throws are handled w/ on-screen error messages when caught
   - split up into files more, util file, etc
   - if possible make progress functionality cleaner w/o hardcode vals

 - remove any remaining comments

 - add more maps ? ( potentially [portal](https://valvearchive.com/archive/Other%20Files/Leaks/2016%20-%20Facepunch%20and%20VCC%20leaks/Files/Portal/)-exported vmfs as .maps ? )

 - make ui actually look like goldsrc w [this](https://github.com/x8BitRain/webhl) && [this](https://github.com/x8BitRain/webhl/blob/master/src/css/greensteam.css)

 - integrate to kuso.day/map.html

 - get back to fpsic proj w/ [this help](https://github.com/sbuggay/bspview/blob/master/spec/hlbsp.md)