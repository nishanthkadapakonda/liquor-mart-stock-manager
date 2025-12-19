# Security Considerations

## XLSX Package Vulnerabilities

The `xlsx` package has known security vulnerabilities (Prototype Pollution and ReDoS). We've implemented the following mitigations:

### 1. Updated Package Version
- Using version 0.20.2 from SheetJS CDN (includes security patches)
- Package is installed from: `https://cdn.sheetjs.com/xlsx-0.20.2/xlsx-0.20.2.tgz`

### 2. Input Validation
- **File Size Limits**: Maximum file size of 10MB to prevent ReDoS attacks
- **Sheet Validation**: Ensures Excel files contain valid sheets
- **Safe Parsing Options**: Disabled date parsing, number format parsing, and style parsing to reduce attack surface

### 3. Prototype Pollution Mitigation
- **Sanitized Objects**: Using `Object.create(null)` for parsed data to prevent prototype chain pollution
- **Key Sanitization**: Filtering out dangerous keys like `__proto__`, `constructor`, and `prototype`
- **Safe Key Names**: Only allowing alphanumeric characters, underscores, and dashes in keys

### 4. Code Location
- Input validation: `frontend/src/utils/fileParsers.ts`
- File size check: `parseFile()` function
- Object sanitization: `normalizeRow()` function

### 5. Recommendations
- Monitor for updates to the xlsx package
- Consider migrating to `exceljs` or another library if vulnerabilities persist
- Regularly run `npm audit` to check for new vulnerabilities
- Limit file uploads to trusted sources only

## General Security Best Practices

1. **Input Validation**: All user inputs are validated and sanitized
2. **Authentication**: JWT-based authentication with role-based access control
3. **File Uploads**: Size limits and type validation on all file uploads
4. **SQL Injection**: Using Prisma ORM with parameterized queries
5. **XSS Prevention**: React automatically escapes user input
6. **CORS**: Configured to allow only trusted origins

