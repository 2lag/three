### todo
 - fix texture offsets & scaling
   - computeUVForVertex is wrong, it is not returning normalized UVs, need to use that for texture scaling tho then offsets should behave properly

 - sort textures in side panel by name

 - go through all comments / todo's

 - clean all this fucking code its a mess ( split up the functionality as much as possible )\
   - no functions longer than 60 lines, no wider than 80-90 chars

 - have selectable default maps as well as custom upload :
   - c1a0 as default map
   - dm1 as default map for quake

 - test map loading from file upload
   - if uploaded/current wad name does not match the one in the map settings/entity, error out and dont load until it does

 - test wad loading from file upload

 - remove all remaining comments

 - add keybind list somewhere

 - redesign ui to be even better

 - test mobile ( add into command on kuso.day )

 - done