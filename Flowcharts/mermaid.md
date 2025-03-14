flowchart TD
        Title["Symptom: The Laser Tag devices are not reacting to each other"]
    Title --> |Start| CheckTeams
    CheckTeams["First, check your team settings Look at the A0, A1, and A2 pins on the breadboard that are marked with the color GREEN. A green wire should connect between one of these team pins and the BLACK ground pins. Each microcontrollers should have a different pin selected. Check your blaster. Does the issue persist?"]
    CheckTeams --> |Yes| CheckCameraIR
    CheckTeams --> |No| Finish
    CheckCameraIR["If you have access to a cellphone camera, point the camera down the front of he Laser Tag blaster and press the trigger button. You can do this to each blaster to verify they are both Is your camera able to detect a flashing purple light?"]
    CheckCameraIR --> |Yes| IRReceiverCheck
    CheckCameraIR --> |No| IREmitterWiring
    Finish["HackPack now functions normally."]
    IRReceiverCheck["Next we will check if the IR Receiver module is working correctly. Take the blaster, point it at the antenna of the other Laser Tag set, and press the trigger button. Look for a series of green LED blinks on the _targeted_ blaster's microcontroller. Did you spot any blinks of the green LED?"]
    IRReceiverCheck --> |Yes| IRReceiverWorking
    IRReceiverCheck --> |No| IREmitterFailing
    IREmitterWiring["Double check the wiring. If the issue persists, please email help\@crunchlabs.com to get a replacement IR LED. Does this resolve the issue?"]
    IRReceiverWorking["This means the IR receiver is working properly. Therefore the servo-motor is the only remaining component that could be causing the malfunction. Double check any wires. If the issue persists, please email help\@crunchlabs.com to get a replacement Servo Motor."]
    IREmitterFailing["This IR receiver is not working properly, and not detecting the incoming signals. Double check your wiring. If the issue persists, please email help\@crunchlabs.com to get a replacement IR Receiver."]
        %% Node-specific styling
        style Title white-space:nowrap
        style Title stroke-width:3px;

        %% templateColor #d94d3b