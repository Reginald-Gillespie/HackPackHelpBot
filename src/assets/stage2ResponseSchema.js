const { SchemaType } = require("@google/generative-ai");

module.exports = {
    type: SchemaType.OBJECT,
    properties: {
        "thoughts": {
            description: "Think about whether the given question can be reliably answered with the provided information.",
            type: SchemaType.STRING,
            nullable: false,
        },
        "reliably_confidence": {
            description: "How confident you are that FAQ answers the question, from 1 (somewhat confident) to 5 (very confident).",
            type: SchemaType.INTEGER,
        },
        "tailored_response": {
            description: "Your answer that the user will see.",
            type: SchemaType.STRING,
            nullable: false,
        },
        "confidence": {
            description: "How confident you are that your answer is relevant and correct, from 1 (somewhat confident) to 5 (very confident).",
            type: SchemaType.INTEGER,
        }
    },
    required: [
        "thoughts",
        "reliably_confidence",
        "tailored_response",
        "confidence"
    ],
    propertyOrdering: [
        "thoughts",
        "reliably_confidence",
        "tailored_response",
        "confidence"
    ]
}