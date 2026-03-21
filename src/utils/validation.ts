export interface ValidationError {
  field: string;
  message: string;
}

export interface RegistrationData {
  name: string;
  description: string;
  skills: string;
  basePrice: string;
  token?: string;
}

export function validateRegistrationData(data: RegistrationData): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate name
  if (!data.name?.trim()) {
    errors.push({ field: "name", message: "Name is required" });
  } else if (data.name.trim().length < 2) {
    errors.push({ field: "name", message: "Name must be at least 2 characters long" });
  } else if (data.name.trim().length > 50) {
    errors.push({ field: "name", message: "Name cannot exceed 50 characters" });
  } else if (!/^[a-zA-Z0-9\s\-_]+$/.test(data.name.trim())) {
    errors.push({ field: "name", message: "Name can only contain letters, numbers, spaces, hyphens, and underscores" });
  }

  // Validate description
  if (!data.description?.trim()) {
    errors.push({ field: "description", message: "Description is required" });
  } else if (data.description.trim().length < 10) {
    errors.push({ field: "description", message: "Description must be at least 10 characters long" });
  } else if (data.description.trim().length > 1000) {
    errors.push({ field: "description", message: "Description cannot exceed 1000 characters" });
  }

  // Validate skills
  if (!data.skills?.trim()) {
    errors.push({ field: "skills", message: "Skills are required" });
  } else {
    const skillsList = data.skills.split(",").map(s => s.trim()).filter(s => s.length > 0);

    if (skillsList.length === 0) {
      errors.push({ field: "skills", message: "At least one skill is required" });
    } else if (skillsList.length > 20) {
      errors.push({ field: "skills", message: "Cannot have more than 20 skills" });
    } else {
      const invalidSkills = skillsList.filter(skill =>
        skill.length < 2 ||
        skill.length > 30 ||
        !/^[a-zA-Z0-9\s\-_]+$/.test(skill)
      );

      if (invalidSkills.length > 0) {
        errors.push({
          field: "skills",
          message: "Each skill must be 2-30 characters and contain only letters, numbers, spaces, hyphens, and underscores"
        });
      }
    }
  }

  // Validate base price
  if (!data.basePrice?.trim()) {
    errors.push({ field: "basePrice", message: "Base price is required" });
  } else {
    const price = parseFloat(data.basePrice);
    if (isNaN(price)) {
      errors.push({ field: "basePrice", message: "Price must be a valid number" });
    } else if (price <= 0) {
      errors.push({ field: "basePrice", message: "Price must be greater than 0" });
    } else if (price > 1000000) {
      errors.push({ field: "basePrice", message: "Price cannot exceed 1,000,000" });
    } else if (!/^\d*\.?\d{0,8}$/.test(data.basePrice)) {
      errors.push({ field: "basePrice", message: "Price cannot have more than 8 decimal places" });
    }
  }

  // Validate token (optional field)
  if (data.token && data.token.trim() && data.token.trim() !== "No Token") {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(data.token.trim())) {
      errors.push({ field: "token", message: "Invalid token address format" });
    }
  }

  return errors;
}

export function sanitizeRegistrationData(data: RegistrationData): RegistrationData {
  return {
    name: data.name?.trim() || "",
    description: data.description?.trim() || "",
    skills: data.skills?.split(",")
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .join(",") || "",
    basePrice: data.basePrice?.trim() || "",
    token: data.token?.trim() === "No Token" ? undefined : data.token?.trim()
  };
}

export function formatSkillsForCommand(skills: string): string {
  return skills.split(",")
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => `"${s.replace(/"/g, '\\"')}"`)
    .join(",");
}

export function escapeForShell(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$").replace(/`/g, "\\`")}"`;
}
