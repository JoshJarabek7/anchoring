# Using Structured Outputs with OpenAI API

This document provides guidance on how to implement structured outputs with the OpenAI API using Zod schemas for validation.

## Basic Implementation

To implement structured outputs:

1. Define a Zod schema that describes your expected output structure
2. Configure the OpenAI API request with the `response_format` parameter
3. Parse and validate the response

```typescript
import { z } from "zod";

// Define your schema
const ExampleSchema = z.object({
  title: z.string(),
  summary: z.string(),
  tags: z.array(z.string()),
  rating: z.number().min(1).max(5),
});

// Make OpenAI API call with structured output
async function getStructuredOutput(prompt: string) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: prompt }
      ],
      response_format: { 
        type: "json_object", 
        schema: ExampleSchema.shape 
      }
    })
  });
  
  const result = await response.json();
  const content = result.choices[0]?.message?.content;
  
  // Parse and validate with Zod
  if (content) {
    try {
      const parsedResponse = JSON.parse(content);
      const validatedResponse = ExampleSchema.parse(parsedResponse);
      return validatedResponse;
    } catch (error) {
      console.error("Error parsing structured output:", error);
      throw error;
    }
  }
}
```

## Advanced Usage: Nested Schemas

You can create complex nested schemas:

```typescript
const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
});

const CommentSchema = z.object({
  id: z.string(),
  text: z.string(),
  author: UserSchema,
  timestamp: z.string().datetime(),
});

const BlogPostSchema = z.object({
  title: z.string(),
  content: z.string(),
  author: UserSchema,
  tags: z.array(z.string()),
  comments: z.array(CommentSchema),
  published: z.boolean(),
  createdAt: z.string().datetime(),
});
```

## Handling Arrays

When you need an array of structured objects:

```typescript
const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number().positive(),
  category: z.string(),
});

const ProductListSchema = z.object({
  products: z.array(ProductSchema),
  totalCount: z.number().int().positive(),
});
```

## Enums and Union Types

For fields that can have specific values:

```typescript
const StatusEnum = z.enum(['pending', 'processing', 'completed', 'failed']);

const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: StatusEnum,
  assignee: z.string().optional(),
});

// Union types for different response structures
const ResponseSchema = z.union([
  z.object({ success: z.literal(true), data: z.any() }),
  z.object({ success: z.literal(false), error: z.string() })
]);
```

## Error Handling

Proper error handling for schema validation:

```typescript
try {
  const parsedResponse = JSON.parse(content);
  const validatedResponse = MySchema.parse(parsedResponse);
  return validatedResponse;
} catch (error) {
  if (error instanceof z.ZodError) {
    // Handle validation errors
    console.error("Validation errors:", error.errors);
  } else if (error instanceof SyntaxError) {
    // Handle JSON parsing errors
    console.error("JSON parsing error:", error.message);
  } else {
    // Handle other errors
    console.error("Unknown error:", error);
  }
  throw error;
}
```

## Using with Function Calls

You can combine structured outputs with function calling:

```typescript
const response = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`
  },
  body: JSON.stringify({
    model: "gpt-4o",
    messages: [...],
    tools: [{
      type: "function",
      function: {
        name: "process_data",
        description: "Process structured data from user input",
        parameters: MySchema.shape
      }
    }],
    tool_choice: {
      type: "function",
      function: { name: "process_data" }
    }
  })
});
```

## Type Safety

For TypeScript integration, you can extract the type from a Zod schema:

```typescript
type MySchemaType = z.infer<typeof MySchema>;

// Now you can use it for type safety
function processData(data: MySchemaType) {
  // Type-safe access to data
}
```

## Best Practices

1. **Provide Field Descriptions**: Use `.describe()` to provide context for each field
   ```typescript
   const UserSchema = z.object({
     name: z.string().describe("The user's full name"),
     email: z.string().email().describe("The user's email address")
   });
   ```

2. **Use Default Values**: Set default values for optional fields
   ```typescript
   const ConfigSchema = z.object({
     theme: z.string().default("light"),
     notifications: z.boolean().default(true)
   });
   ```

3. **Refine Values**: Use `.refine()` for custom validation logic
   ```typescript
   const DateRangeSchema = z.object({
     start: z.string().datetime(),
     end: z.string().datetime()
   }).refine(data => new Date(data.start) < new Date(data.end), {
     message: "End date must be after start date",
     path: ["end"]
   });
   ```

4. **Transform Values**: Use `.transform()` to modify values after validation
   ```typescript
   const UserInputSchema = z.object({
     email: z.string().email().transform(val => val.toLowerCase())
   });
   ```