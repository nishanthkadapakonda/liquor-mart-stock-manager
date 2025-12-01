import type { AnyZodObject } from "zod";
import { ZodError } from "zod";

export function validate<T extends AnyZodObject>(schema: T, data: unknown) {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues.map((issue) => issue.message).join(", ");
      throw new Error(issues);
    }
    throw error;
  }
}
