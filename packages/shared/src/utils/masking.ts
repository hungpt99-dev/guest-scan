export function maskString(value: string, visibleStart: number = 4, maskChar: string = "*"): string {
  if (value.length <= visibleStart) {
    return value;
  }
  const visible = value.slice(0, visibleStart);
  const masked = maskChar.repeat(value.length - visibleStart);
  return visible + masked;
}

export function maskPassportNumber(passport: string): string {
  return maskString(passport, 4);
}

export function maskIdNumber(id: string): string {
  return maskString(id, 4);
}

export function maskFullName(name: string): string {
  const parts = name.split(" ");
  if (parts.length === 0) return name;
  const lastName = parts[parts.length - 1];
  if (!lastName) return name;
  return maskString(lastName, 1);
}
