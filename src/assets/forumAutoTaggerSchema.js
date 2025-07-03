const { SchemaType } = require("@google/generative-ai");

module.exports = {
    "type": SchemaType.OBJECT,
    "properties": {
        "thoughts": {
            "type": SchemaType.STRING
        },
        "tags": {
            "type": SchemaType.ARRAY,
            "items": {
                "type": SchemaType.STRING
            }
        },
    },
    required: [
        "thoughts",
        "tags"
    ],
    propertyOrdering: [
        "thoughts",
        "tags"
    ]
}