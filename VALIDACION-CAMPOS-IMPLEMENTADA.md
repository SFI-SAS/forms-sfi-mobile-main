# Validación de Campos del Formulario

## ✅ Sistema de Validación en Tiempo Real Implementado

Se ha implementado un sistema completo de validación de campos que **valida el tipo de dato en tiempo real** mientras el usuario escribe. Cuando se ingresa un carácter inválido, el sistema:

1. ✅ **Muestra un mensaje de error en rojo** debajo del campo
2. ✅ **Resalta el campo con borde rojo** y fondo ligeramente rojo
3. ✅ **Agrega sombra** para mayor visibilidad del error
4. ✅ **Permite continuar escribiendo** (no bloquea la entrada)

---

## 📋 Tipos de Campo Soportados

### 1. **Campo de Texto** (`text`)
- **Descripción**: 📝 Acepta cualquier texto sin restricción
- **Caracteres permitidos**: Cualquier carácter
- **Validación**: Sin restricciones
- **Ejemplo**: Nombre, dirección, comentarios

### 2. **Campo Numérico** (`number`)
- **Descripción**: 🔢 Solo números (0-9), punto decimal y signo negativo
- **Caracteres permitidos**: `0-9`, `.`, `-`
- **Patrón**: `/^-?\d*\.?\d*$/`
- **Error mostrado**: ⚠️ Este campo solo acepta números (0-9, punto decimal y signo negativo)
- **Ejemplos válidos**: `123`, `-45.67`, `0.5`, `-10`
- **Ejemplos inválidos**: `abc`, `12a`, `1.2.3`

### 3. **Campo de Email** (`email`)
- **Descripción**: 📧 Formato de correo electrónico
- **Caracteres permitidos**: Letras, números, `@`, `.`, `-`, `_`
- **Patrón básico**: `/^[^\s@]*@?[^\s@]*\.?[^\s@]*$/` (validación mientras escribe)
- **Patrón completo**: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` (validación final)
- **Error mostrado**: 
  - ⚠️ Formato de email inválido (debe contener @ y dominio)
  - ⚠️ Email incompleto (ejemplo: usuario@dominio.com)
- **Ejemplos válidos**: `usuario@ejemplo.com`, `test@mail.co`
- **Ejemplos inválidos**: `usuario@`, `@ejemplo.com`, `usuario ejemplo.com`

### 4. **Campo de Teléfono** (`phone`)
- **Descripción**: 📞 Números y símbolos telefónicos
- **Caracteres permitidos**: `0-9`, `+`, `-`, `()`, espacio
- **Patrón**: `/^[\d\s()+-]*$/`
- **Error mostrado**: ⚠️ Solo se permiten números, espacios y símbolos telefónicos (+, -, (), espacio)
- **Ejemplos válidos**: `+57 300 1234567`, `(123) 456-7890`, `555-1234`
- **Ejemplos inválidos**: `abc123`, `555#1234`

### 5. **Campo de URL** (`url`)
- **Descripción**: 🔗 Dirección web
- **Formato esperado**: `http://` o `https://` seguido de dominio
- **Patrón**: `/^(https?:\/\/)?([\da-z.-]+)\.?([a-z.]{0,6})([/\w .-]*)*\/?$/i`
- **Error mostrado**: ⚠️ Formato de URL inválido (ejemplo: https://ejemplo.com)
- **Ejemplos válidos**: `https://ejemplo.com`, `http://test.co/path`, `ejemplo.com`
- **Ejemplos inválidos**: `htp://ejemplo`, `ejemplo`

### 6. **Campo Alfanumérico** (`alphanumeric`)
- **Descripción**: 🔤 Solo letras y números (sin espacios)
- **Caracteres permitidos**: `a-z`, `A-Z`, `0-9`
- **Patrón**: `/^[a-zA-Z0-9]*$/`
- **Error mostrado**: ⚠️ Solo se permiten letras (a-z, A-Z) y números (0-9), sin espacios
- **Ejemplos válidos**: `ABC123`, `Test2024`, `codigo001`
- **Ejemplos inválidos**: `ABC 123`, `Test-2024`, `código_001`

### 7. **Campo de Fecha** (`date`)
- **Descripción**: 📅 Fecha en formato estándar
- **Formatos aceptados**: `YYYY-MM-DD` o `DD/MM/YYYY`
- **Patrón**: `/^\d{4}-\d{2}-\d{2}$/` o `/^\d{2}\/\d{2}\/\d{4}$/`
- **Error mostrado**: ⚠️ Formato de fecha inválido (use YYYY-MM-DD o DD/MM/YYYY)
- **Ejemplos válidos**: `2024-12-15`, `15/12/2024`
- **Ejemplos inválidos**: `12-15-2024`, `2024/12/15`

### 8. **Campo de Hora** (`time`)
- **Descripción**: ⏰ Hora en formato 24h
- **Formatos aceptados**: `HH:MM` o `HH:MM:SS`
- **Patrón**: `/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/`
- **Error mostrado**: ⚠️ Formato de hora inválido (use HH:MM o HH:MM:SS)
- **Ejemplos válidos**: `14:30`, `09:45:30`, `23:59`
- **Ejemplos inválidos**: `25:00`, `14:60`, `9:30` (falta cero)

---

## 🎨 Estilos Visuales de Error

### Campo con Error
```
Borde: 2px sólido rojo (#EF4444)
Fondo: Rojo muy claro (#FEF2F2)
Sombra: Sombra roja suave
Elevación: Efecto 3D para resaltar
```

### Mensaje de Error
```
Color: Rojo oscuro (#DC2626)
Tamaño: 13px
Peso: Semi-bold (600)
Ubicación: Debajo del campo con margen superior
```

---

## 🔧 Implementación Técnica

### Archivos Modificados

1. **`components/FormRenderer/fields/FieldValidationHelper.tsx`** (NUEVO)
   - Sistema centralizado de validadores
   - Funciones de validación por tipo
   - Descripciones de tipos de campo

2. **`components/FormRenderer/fields/FieldTypeHint.tsx`** (NUEVO)
   - Componente visual de pista de tipo
   - Muestra descripción del tipo esperado

3. **`components/FormRenderer/fields/InputField.tsx`**
   - Validación en tiempo real en `handleChange`
   - Integración con sistema de validadores
   - Soporte para `showTypeHint` (opcional)

4. **`components/FormRenderer/fields/FieldStubs.tsx`**
   - `NumberField` usa `fieldType="number"`

5. **`components/ui/FormUI.tsx`**
   - Estilos mejorados para `inputError`
   - Mensaje de error más visible (`errorText`)
   - Soporte para `keyboardType`

6. **`components/FormRenderer/FormRenderer.tsx`**
   - Mapeo automático de tipos del backend
   - Detección de `fieldType` o `type` en props
   - Aplicación automática de validación

### Flujo de Validación

```
Usuario escribe → handleChange() → Validator ejecuta regex → 
Resultado de validación → Actualiza validationError → 
Muestra error visual si hay error
```

---

## 📝 Uso en el Formulario

### Detección Automática
El sistema **detecta automáticamente el tipo de campo** del backend:

```typescript
// Backend envía:
{
  type: "input",
  props: {
    fieldType: "number"  // ← Se detecta automáticamente
  }
}

// FormRenderer lo mapea a validación:
<InputField fieldType="number" />
```

### Mapeo de Tipos del Backend
```typescript
Backend Type → Validation Type
---------------------------------
'number'      → 'number'
'numeric'     → 'number'
'email'       → 'email'
'phone'       → 'phone'
'tel'         → 'phone'
'url'         → 'url'
'alphanumeric'→ 'alphanumeric'
'text'        → 'text' (default)
```

---

## ✨ Características Adicionales

### 1. No Bloquea la Escritura
El usuario **puede seguir escribiendo** incluso con errores. La validación solo muestra advertencias visuales, pero no impide la entrada de datos.

### 2. Validación Progresiva
Para campos como email, la validación es **progresiva**:
- Mientras escribe: Validación permisiva
- Al completar: Validación estricta

### 3. Prioridad de Errores
```
1. Error de tipo (validación en tiempo real)
2. Error externo (validación del formulario)
3. Error de campo requerido (al enviar)
```

### 4. Compatibilidad con MathOperationsField
Los campos numéricos validados correctamente funcionan con `MathOperationsField`:
- Solo valores numéricos válidos
- Redondeados a 2 decimales
- Limpios de caracteres inválidos

---

## 🧪 Pruebas

### Probar Validación de Número
1. Abrir formulario con campo numérico
2. Escribir letras → Ver error rojo
3. Escribir números → Error desaparece
4. Escribir `12.5` → Válido
5. Escribir `-45` → Válido
6. Escribir `12a` → Error

### Probar Validación de Email
1. Abrir formulario con campo email
2. Escribir `usuario` → Sin error (aún escribe)
3. Escribir `usuario@` → Sin error (aún escribe)
4. Escribir `usuario@ejemplo` → Error de email incompleto
5. Escribir `usuario@ejemplo.com` → Error desaparece

### Probar Validación de Teléfono
1. Escribir números → Válido
2. Escribir `+57 300` → Válido
3. Escribir `(123)` → Válido
4. Escribir `abc` → Error

---

## 📊 Estado Actual

✅ **Completado**:
- Sistema de validadores por tipo
- Validación en tiempo real
- Estilos visuales de error mejorados
- Integración con FormRenderer
- Detección automática de tipos del backend
- Soporte para 8 tipos de campo diferentes
- Mensajes de error específicos por tipo

⚠️ **Opcional** (no implementado por defecto):
- Pistas visuales de tipo con `FieldTypeHint`
- Se pueden activar con `showTypeHint={true}`

---

## 🎯 Resultado Final

El usuario ahora recibe **retroalimentación inmediata y visual** cuando:
- ❌ Ingresa letras en campo numérico
- ❌ Ingresa formato inválido en email
- ❌ Usa caracteres no permitidos en teléfono
- ✅ Completa correctamente cualquier campo

**El campo se resalta en rojo con mensaje claro de qué está mal** 🔴
