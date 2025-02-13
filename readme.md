### todo
 - get map loading from file upload
   - if uploaded/current wad name does not match the one in the map settings/entity, error out w/ on screen message ( clear on matching wad load ) and dont load until it does ( split by '/' if in string and get last since we just want file name )

 - get wad loading from file upload

 - go through all comments / todos
 
 - fix texture offsets / scaling, still not 100% correct ( on quake maps only i think, but maybe both. )
   - also some planes are just completely wrong for some reason on c1a0, look at the left corner in the entrance room after airlock ( just rotation of geometry i think )

 - clean all this fucking code its a mess ( split up the functionality as much as possible )
   - no functions longer than 60 lines, no wider than 80-90 chars
   - make sure all throws are handled

 - show status of loading with progress bar ( alr impld, just need integ )
   - make it animated

 - make loading/parsing & running faster
   - more async ?
   - profile site w ff dev ed

 - find / make better movement controller
   - unless its okay on mobile ( this should be tested alr )

 - remove all remaining comments

 - add keybind list somewhere

 - redesign ui to be even better if needed

 - clean all this fucking code its a mess ( split up the functionality as much as possible )
   - no functions longer than 60 lines, no wider than 80-90 chars

 - integrate to kuso.day/map.html