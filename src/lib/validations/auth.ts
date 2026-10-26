import { z } from "zod";

export const SignupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name cannot exceed 50 characters"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Please provide a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100, "Password cannot exceed 100 characters")
    .regex(/[a-zA-Z]/, "Password must contain at least one letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  role: z.enum(["CLIENT", "FREELANCER"], {
    error: "Role must be either Client or Freelancer",
  }),
});

export type SignupInput = z.infer<typeof SignupSchema>;

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
  redirectTo: z.string().optional(),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export const SelectRoleSchema = z.object({
  role: z.enum(["CLIENT", "FREELANCER"], {
    error: "Role must be either Client or Freelancer",
  }),
});

export type SelectRoleInput = z.infer<typeof SelectRoleSchema>;
