### todo
 - clean main.js
   - no functions longer than 60 lines, no wider than 80-90 chars ( just parseMap & mapFileChange )
   - make sure all throws are handled w/ on-screen error messages when caught
   - make sure all null / early rets are handled
   - split up into files more, util file, etc

 - make progress functionality cleaner w/o hardcode vals
 
 - go thru any remaining comments

 - make loading/parsing & running faster
   - profile site w chromium tools ( all looks good on ff )

 - fix textures, still not 100% correct ( ONLY ON LIKE SOME QUAKE FACES )
   - all seem to be inverted horizontally, and some seem to be offset improperly, but trenchbroom has no issue rendering so i don't know where the problem lies
   - [here](https://github.com/TrenchBroom/TrenchBroom/blob/master/common/src/mdl/UVCoordSystem.h) || [here](https://github.com/TrenchBroom/TrenchBroom/blob/master/common/src/mdl/MapFormat.cpp)
 - ^^ texture problem may be result of not parsing brush properties/headers, not 100% sure though

 - get back to fpsic proj w/ [this project](https://github.com/2lag/three) & [this help](https://github.com/sbuggay/bspview/blob/master/spec/hlbsp.md) & also [this help](https://valvedev.info/guides/accelerating-map-compiles-in-quake-based-engines/) & [this](https://valvedev.info/guides/what-goes-into-compiling-a-source-map/)... basically anything [here](https://valvedev.info/guides/)

 - integrate to kuso.day/map.html ( test on mobile then update "work" cmd onsite w/ this + axonbox, then post on twt )
   - see if u can auto pull from this repo when it updates w/ github actions


SHOUT OUT : https://github.com/x8BitRain/webhl FOR GOLDSRC CSS
SHOUT OUT : https://github.com/sbuggay/bspview/ FOR CAMERA CONTROLLER BASE ( comes from Mr. James Baicoianu )

future todo :
 - add quake ui for quake .maps
 - 