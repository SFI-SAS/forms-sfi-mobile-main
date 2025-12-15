/**
 * FieldValidationHelper.tsx
 * Utilidades de validación para diferentes tipos de campos del formulario
 */

export interface ValidationResult {
    isValid: boolean;
    errorMessage?: string;
}

/**
 * Validadores por tipo de campo
 */
export const validators = {
    /**
     * Campo numérico: Solo números, punto decimal opcional, signo negativo opcional
     */
    number: (value: string): ValidationResult => {
        if (!value) return { isValid: true };

        const isValid = /^-?\d*\.?\d*$/.test(value);
        return {
            isValid,
            errorMessage: isValid ? undefined : '⚠️ Este campo solo acepta números (0-9, punto decimal y signo negativo)'
        };
    },

    /**
     * Campo de texto: Acepta cualquier carácter sin restricción
     */
    text: (value: string): ValidationResult => {
        return { isValid: true };
    },

    /**
     * Campo de email: Validación básica de formato email
     */
    email: (value: string): ValidationResult => {
        if (!value) return { isValid: true };

        // Validación simple: permite mientras escribe
        const isValid = /^[^\s@]*@?[^\s@]*\.?[^\s@]*$/.test(value);

        // Validación completa solo si parece completo
        const isComplete = value.includes('@') && value.includes('.');
        const isValidComplete = isComplete ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) : true;

        return {
            isValid: isValid && isValidComplete,
            errorMessage: !isValid ? '⚠️ Formato de email inválido (debe contener @ y dominio)'
                : !isValidComplete ? '⚠️ Email incompleto (ejemplo: usuario@dominio.com)'
                    : undefined
        };
    },

    /**
     * Campo de teléfono: Solo números, espacios, guiones, paréntesis y signo +
     */
    phone: (value: string): ValidationResult => {
        if (!value) return { isValid: true };

        const isValid = /^[\d\s()+-]*$/.test(value);
        return {
            isValid,
            errorMessage: isValid ? undefined : '⚠️ Solo se permiten números, espacios y símbolos telefónicos (+, -, (), espacio)'
        };
    },

    /**
     * Campo de URL: Validación básica de formato URL
     */
    url: (value: string): ValidationResult => {
        if (!value) return { isValid: true };

        // Permite mientras escribe
        const isValid = /^(https?:\/\/)?([\da-z.-]+)\.?([a-z.]{0,6})([/\w .-]*)*\/?$/i.test(value);

        return {
            isValid,
            errorMessage: isValid ? undefined : '⚠️ Formato de URL inválido (ejemplo: https://ejemplo.com)'
        };
    },

    /**
     * Campo alfanumérico: Solo letras y números (sin espacios ni caracteres especiales)
     */
    alphanumeric: (value: string): ValidationResult => {
        if (!value) return { isValid: true };

        const isValid = /^[a-zA-Z0-9]*$/.test(value);
        return {
            isValid,
            errorMessage: isValid ? undefined : '⚠️ Solo se permiten letras (a-z, A-Z) y números (0-9), sin espacios'
        };
    },

    /**
     * Campo de fecha: Validación básica de formato fecha
     */
    date: (value: string): ValidationResult => {
        if (!value) return { isValid: true };

        // Formato YYYY-MM-DD o DD/MM/YYYY
        const isValid = /^\d{4}-\d{2}-\d{2}$/.test(value) || /^\d{2}\/\d{2}\/\d{4}$/.test(value);

        return {
            isValid,
            errorMessage: isValid ? undefined : '⚠️ Formato de fecha inválido (use YYYY-MM-DD o DD/MM/YYYY)'
        };
    },

    /**
     * Campo de hora: Validación de formato hora
     */
    time: (value: string): ValidationResult => {
        if (!value) return { isValid: true };

        // Formato HH:MM o HH:MM:SS
        const isValid = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/.test(value);

        return {
            isValid,
            errorMessage: isValid ? undefined : '⚠️ Formato de hora inválido (use HH:MM o HH:MM:SS)'
        };
    }
};

/**
 * Obtener descripción del tipo de campo para el usuario
 */
export const getFieldTypeDescription = (fieldType: string): string => {
    const descriptions: Record<string, string> = {
        text: '📝 Acepta cualquier texto sin restricción',
        number: '🔢 Solo números (0-9), punto decimal y signo negativo',
        email: '📧 Formato de correo electrónico (usuario@dominio.com)',
        phone: '📞 Números y símbolos telefónicos (+, -, paréntesis)',
        url: '🔗 Dirección web (https://ejemplo.com)',
        alphanumeric: '🔤 Solo letras y números (sin espacios)',
        date: '📅 Fecha en formato YYYY-MM-DD',
        time: '⏰ Hora en formato HH:MM',
    };

    return descriptions[fieldType] || '📝 Campo de texto';
};

/**
 * Lista de tipos de campo soportados
 */
export const SUPPORTED_FIELD_TYPES = [
    'text',
    'number',
    'email',
    'phone',
    'url',
    'alphanumeric',
    'date',
    'time'
] as const;

export type FieldType = typeof SUPPORTED_FIELD_TYPES[number];
