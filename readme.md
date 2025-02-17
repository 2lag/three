### todo
 - fix textures, still not 100% correct ( ONLY ON LIKE HALF OF QUAKE FACES )
   - x is inverted on some faces, and some offsets -- NOT ALL -- are wrong

 - make better movement controller that incorporates delta time AND works w touch controls ( mayb onscreen ? idk )
   - unless its okay on mobile ( this should be tested alr )
   - if it doesn't work well, copy [this](https://github.com/sbuggay/bspview/blob/master/src/CameraControls.ts) and add onscreen control/joystick as well as keybound ctls

 - make loading/parsing & running faster
   - profile site w ff dev ed
   - more async ? or is that the issue .. . .

 - add hideable keybind list somewhere ( top / bottom right )

 - clean all this fucking code its a mess ( split up the functionality as much as possible )
   - no functions longer than 60 lines, no wider than 80-90 chars
   - make sure all throws are handled w/ on-screen error messages when caught
   - split up into files more, util file, etc
   - if possible make progress functionality cleaner w/o hardcode vals

 - make ui actually look like goldsrc w [this](https://github.com/x8BitRain/webhl) && [this](https://github.com/x8BitRain/webhl/blob/master/src/css/greensteam.css)

 - go thru any remaining comments

 - integrate to kuso.day/map.html

 - get back to fpsic proj w/ [this project](https://github.com/2lag/three) & [this help](https://github.com/sbuggay/bspview/blob/master/spec/hlbsp.md) & also [this help](https://valvedev.info/guides/accelerating-map-compiles-in-quake-based-engines/) & [this](https://valvedev.info/guides/what-goes-into-compiling-a-source-map/)... basically anything [here](https://valvedev.info/guides/)