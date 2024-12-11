flowchart TD
    Title["My Label Maker isn't working"]
    Title --> Screen[My screen isn't working]
    Title --> Motor[A tape motor isn't working]
    Title --> Servo[My servo isn't working]
    Title --> Joystick[My joystick isn't working]
    Title --> Power[It won't turn on]

    %% LCD Issues
    Screen --> ScreenPushIn[Push the arduino firmly into the breadboard, it might click into place. Does it work now?]
    ScreenPushIn --> CheckBacklight[Is the backlight on?]
    CheckBacklight --> |No| ReplaceLCD[Contact CrunchLabs for a replacement screen]
    CheckBacklight --> |Yes| LCDAnotherArduino[Try uploading Label Maker code to a different Arduino from ide.crunchlabs.com, and use this arduino. Does it work now?]
    LCDAnotherArduino --> |No| ReplaceLCD
    LCDAnotherArduino --> |Yes| ReplacementArduino[Contact CrunchLabs for a replacement Arduino]

    %% Motor Issues
    Motor --> BackwardsCheck[Is the motor going backwards?]
    BackwardsCheck  --> |Yes| BackwardsFix[Take the 4 signal wires for the backwards motor, and flip them around in the breadboard]
    BackwardsCheck --> |No| MotorAnotherArduino[Try uploading Label Maker code to a different Arduino from ide.crunchlabs.com, and use this arduino. Does it work now?]
    MotorAnotherArduino --> |No| SwapMotorsCheck[If a motor isn't working, swap which motor is plugged into which driver, you will need to unscrew a driver from the wall to reach. Does the broken axis swap to being the other motor?]
    SwapMotorsCheck --> |Yes| ReplacementDriver[Contact CrunchLabs for a replacement driver]
    SwapMotorsCheck --> |No| ReplacementMotor[Contact CrunchLabs for a replacement Stepper Motor]

    %% Servo issues
    Servo --> CheckMoving["Is the servo moving or making sound?"]
    CheckMoving --> |Yes| ReplacementServo[Contact CrunchLabs for a replacement servo]
    CheckMoving --> |No| ServoHelp[Contact CrunchLabs for additional help]

    %% Joystick Issues
    Joystick --> JoystickPushIn[Push the arduino firmly into the breadboard, it might click into place. Does it work now?]
    JoystickPushIn --> |No| ReplacementJoystick[Contact CrunchLabs for a replacement joystick]

    %% Power Issues
    Power --> PowerPushIn[Push the arduino firmly into the breadboard, it might click into place. Did it turn on?]
    PowerPushIn --> |No| CheckBackwardsWires[Make sure you don't have red and black wires backwards. Does it turn on now?]
    CheckBackwardsWires --> |No| TryAnotherBattery[Try a charged battery from another Hack Pack. Does it turn on now?]
    TryAnotherBattery --> |Yes| ReplacementBattery[Charge your battery, if it still doesn't work contact CrunchLabs for a replacement battery]
    TryAnotherBattery --> |No| Help[Contact CrunchLabs for additional help]

    %% Node-specific styling
    style Title white-space:nowrap
    style Title stroke-width:3px;

    %% templateColor #644e9b