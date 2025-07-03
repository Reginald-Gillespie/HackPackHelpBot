const { SchemaType } = require("@google/generative-ai");

module.exports = {
    type: SchemaType.OBJECT,
    properties: {
        "thoughts": {
            description: "Think about which response is the best, or if there is even a best response.",
            type: SchemaType.STRING,
            nullable: false,
        },
        "chosen_response": {
            description: "After thinking, write down your final answer.",
            type: SchemaType.INTEGER,
        },
        "confidence": {
            description: "How confident you are that your answer is relevant, from 1 (fairly confident) to 5 (very confident).",
            type: SchemaType.INTEGER,
        }
    },
    required: [
        "thoughts",
        "chosen_response",
        "confidence"
    ],
    propertyOrdering: [
        "thoughts",
        "chosen_response",
        "confidence"
    ]
}