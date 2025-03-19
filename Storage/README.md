Help messages are stored in the helpMessagesSaveX.json file, whichever one was written to more recently is the one that matters. Two files are used instead of one to follow the 3-2-1 backup rule, which can prevent issues if one file is written to at the same time as the bot crashes or restarts.

TODO:
I'm not sure that file write time metadata is transfered accross github. 