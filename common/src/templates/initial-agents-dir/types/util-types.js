import z from 'zod/v4';
export const jsonValueSchema = z.lazy(() => z.union([
    z.null(),
    z.string(),
    z.number(),
    z.boolean(),
    jsonObjectSchema,
    jsonArraySchema,
]));
export const jsonObjectSchema = z.lazy(() => z.record(z.string(), jsonValueSchema));
export const jsonArraySchema = z.lazy(() => z.array(jsonValueSchema));
// ===== Data Content Types =====
export const dataContentSchema = z.union([
    z.string(),
    z.instanceof(Uint8Array),
    z.instanceof(ArrayBuffer),
    z.custom(
    // Buffer might not be available in some environments such as CloudFlare:
    (value) => globalThis.Buffer?.isBuffer(value) ?? false, { message: 'Must be a Buffer' }),
]);
// ===== Provider Metadata Types =====
export const providerMetadataSchema = z.record(z.string(), z.record(z.string(), jsonValueSchema));
// ===== Content Part Types =====
export const textPartSchema = z.object({
    type: z.literal('text'),
    text: z.string(),
    providerOptions: providerMetadataSchema.optional(),
});
export const imagePartSchema = z.object({
    type: z.literal('image'),
    image: z.union([dataContentSchema, z.instanceof(URL)]),
    mediaType: z.string().optional(),
    providerOptions: providerMetadataSchema.optional(),
});
export const filePartSchema = z.object({
    type: z.literal('file'),
    data: z.union([dataContentSchema, z.instanceof(URL)]),
    filename: z.string().optional(),
    mediaType: z.string(),
    providerOptions: providerMetadataSchema.optional(),
});
export const reasoningPartSchema = z.object({
    type: z.literal('reasoning'),
    text: z.string(),
    providerOptions: providerMetadataSchema.optional(),
});
export const toolCallPartSchema = z.object({
    type: z.literal('tool-call'),
    toolCallId: z.string(),
    toolName: z.string(),
    input: z.record(z.string(), z.unknown()),
    providerOptions: providerMetadataSchema.optional(),
    providerExecuted: z.boolean().optional(),
});
export const toolResultOutputSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('json'),
        value: jsonValueSchema,
    }),
    z.object({
        type: z.literal('media'),
        data: z.string(),
        mediaType: z.string(),
    }),
]);
export const toolResultPartSchema = z.object({
    type: z.literal('tool-result'),
    toolCallId: z.string(),
    toolName: z.string(),
    output: toolResultOutputSchema.array(),
    providerOptions: providerMetadataSchema.optional(),
});
// ===== Message Types =====
const auxiliaryDataSchema = z.object({
    providerOptions: providerMetadataSchema.optional(),
    timeToLive: z
        .union([z.literal('agentStep'), z.literal('userPrompt')])
        .optional(),
    keepDuringTruncation: z.boolean().optional(),
});
export const systemMessageSchema = z
    .object({
    role: z.literal('system'),
    content: z.string(),
})
    .and(auxiliaryDataSchema);
export const userMessageSchema = z
    .object({
    role: z.literal('user'),
    content: z.union([
        z.string(),
        z.union([textPartSchema, imagePartSchema, filePartSchema]).array(),
    ]),
})
    .and(auxiliaryDataSchema);
export const assistantMessageSchema = z
    .object({
    role: z.literal('assistant'),
    content: z.union([
        z.string(),
        z
            .union([textPartSchema, reasoningPartSchema, toolCallPartSchema])
            .array(),
    ]),
})
    .and(auxiliaryDataSchema);
export const toolMessageSchema = z
    .object({
    role: z.literal('tool'),
    content: toolResultPartSchema,
})
    .and(auxiliaryDataSchema);
export const messageSchema = z
    .union([
    systemMessageSchema,
    userMessageSchema,
    assistantMessageSchema,
    toolMessageSchema,
])
    .and(z.object({
    providerOptions: providerMetadataSchema.optional(),
    timeToLive: z
        .union([z.literal('agentStep'), z.literal('userPrompt')])
        .optional(),
    keepDuringTruncation: z.boolean().optional(),
}));
