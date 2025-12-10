# 📊 Análisis Completo: Versión PC (forms_sfi) vs Versión Móvil

## 🎯 Objetivo
Refactorizar FormatScreen.jsx (móvil) para usar la **LÓGICA Y ENDPOINTS DE PC**, eliminando la lógica actual que causa crashes y problemas de rendimiento.

---

## 📁 ARQUITECTURA VERSIÓN PC (Web)

### **Componentes Clave**

#### 1. **ListForms.tsx** (Componente Principal de Diligenciamiento)
- **Ubicación**: `forms_sfi/src/components/list_forms/ListForms.tsx`
- **Responsabilidad**: Maneja TODO el flujo de diligenciamiento de formularios
- **Líneas**: 1,358 líneas

#### 2. **FormPreviewRenderer.tsx** (Motor de Renderizado)
- **Ubicación**: `forms_sfi/src/components/form-builder/FormPreviewRenderer.tsx`
- **Responsabilidad**: Renderiza TODOS los tipos de campos (input, select, firma, facial, etc.)
- **Líneas**: 2,365 líneas
- **Características**:
  - Maneja 20+ tipos de campos
  - Soporte para tablas dinámicas (repeater)
  - Correlaciones bidireccionales
  - Firma digital + Reconocimiento facial
  - GPS/Ubicación con historial

#### 3. **CategoryExplorerFillForm.tsx** (Navegación de Formularios)
- **Ubicación**: `forms_sfi/src/components/edit_forms/CategoryExplorerFillForm.tsx`
- **Responsabilidad**: Lista y filtra formularios por categoría
- **Líneas**: 453 líneas

---

## 🌐 ENDPOINTS UTILIZADOS EN PC

### **1. Obtener Formularios Asignados**
```
GET /forms/users/form_by_user?page={page}&page_size={pageSize}
Headers: Authorization: Bearer {token}
```

### **2. Obtener Diseño del Formulario (form_design)**
```
GET /forms/{formId}/form_design
Headers: Authorization: Bearer {token}

Response: {
  form_design: [
    {
      type: "input" | "select" | "textarea" | "firm" | etc.,
      props: {
        label: string,
        required: boolean,
        options: string[],
        placeholder: string,
        ...
      },
      id: string,
      children?: FormItem[]  // Para layouts y repeaters
    }
  ]
}
```

### **3. Obtener Preguntas del Formulario**
```
GET /forms/{formId}/questions
Headers: Authorization: Bearer {token}

Response: {
  questions: [
    {
      id: number,
      question_text: string,
      question_type: "input" | "select" | "textarea" | etc.,
      is_required: boolean,
      related_answers?: any[],  // Para campos con historial
      ...
    }
  ]
}
```

### **4. Guardar Respuesta (Crear response_id)**
```
POST /responses/save-response/{formId}?action={send | send_and_close}
Headers: Authorization: Bearer {token}
Body: [
  {
    question_id: number,
    response: string | object,
    file_path: string,
    form_design_element_id: string
  }
]

Response: {
  response_id: number,
  id_relation_bitacora: number
}
```

### **5. Guardar Respuestas Individuales (save-answers)**
```
POST /responses/save-answers/?action={send | send_and_close}
Headers: Authorization: Bearer {token}
Body: {
  question_id: number,
  answer_text: string | JSON,
  file_path: string,
  response_id: number,
  relation_bitacora_id: number,
  form_design_element_id: string,
  repeated_id?: string  // Para filas de tablas
}

Response: {
  answer: {
    answer_id: number
  }
}
```

### **6. Subir Archivos**
```
POST /responses/upload-file/
Headers: Authorization: Bearer {token}
Content-Type: multipart/form-data

FormData:
  - file: File
  - question_id: number
  - serial: string (opcional)
```

### **7. Obtener Usuarios con Registro Facial**
```
GET /responses/answers/regisfacial
Headers: Authorization: Bearer {token}

Response: [
  {
    answer_text: JSON string con { faceData: { person_id, personName } }
  }
]
```

### **8. Obtener Correlaciones de Tabla**
```
GET /questions/question-table-relation/answers/{questionId}
Headers: Authorization: Bearer {token}

Response: {
  correlations: {
    "field_1_id": {
      "option_value": "correlated_value"
    }
  }
}
```

---

## 🔄 FLUJO DE DILIGENCIAMIENTO EN PC

```mermaid
graph TD
    A[Usuario selecciona formulario] --> B[handleQuestionsByIdForm]
    B --> C{Parallel Fetch}
    C --> D[GET /forms/{id}/form_design]
    C --> E[GET /forms/{id}/questions]
    D --> F[enrichFormDesignWithQuestions]
    E --> F
    F --> G[Enriquecer diseño con preguntas]
    G --> H[Filtrar items innecesarios]
    H --> I[Enriquecer con related_answers]
    I --> J[Extraer styleConfig]
    J --> K[Renderizar con FormPreviewRenderer]
    K --> L[Usuario llena formulario]
    L --> M[handleSubmitForm]
    M --> N[POST /responses/save-response]
    N --> O[Obtener response_id]
    O --> P{Para cada respuesta}
    P --> Q[POST /responses/save-answers]
    Q --> R{¿Tiene archivo?}
    R -->|Sí| S[POST /responses/upload-file]
    R -->|No| T[Siguiente respuesta]
    S --> T
    T --> U[Mostrar éxito y limpiar formulario]
```

---

## 🧩 ESTRUCTURA DE DATOS

### **formStructure** (Estado Principal en PC)
```typescript
interface FormItem {
  id: string;
  type: 'input' | 'select' | 'textarea' | 'date' | 'time' | 'number' | 
        'checkbox' | 'radio' | 'file' | 'firm' | 'regisfacial' | 
        'location' | 'repeater' | 'vertical-layout' | 'horizontal-layout';
  props: {
    label?: string;
    placeholder?: string;
    required?: boolean;
    options?: string[];
    relatedAnswers?: any[];
    minItems?: number;
    maxItems?: number;
    allowCurrentLocation?: boolean;
    // ... más props específicas
  };
  children?: FormItem[];  // Para layouts y repeaters
  questionId?: number;     // Enlace con question de backend
}
```

### **formValues** (Respuestas del Usuario)
```typescript
{
  [itemId: string]: any  // string | number | boolean | object | File
}
```

### **correlations** (Autocompletado de Tablas)
```typescript
{
  [questionId: string]: {
    [fieldId: string]: {
      [optionValue: string]: string  // Mapeo de valores correlacionados
    }
  }
}
```

---

## 🆚 COMPARACIÓN PC vs MÓVIL

| Aspecto | PC (forms_sfi) | Móvil (actual) |
|---------|----------------|----------------|
| **Endpoint Forms** | `/forms/users/form_by_user` | `/forms/user/form_by_user` (diferente) |
| **Diseño** | `/forms/{id}/form_design` | ❌ No usa (reconstruye desde questions) |
| **Preguntas** | `/forms/{id}/questions` | ✅ Usa (desde AsyncStorage) |
| **Guardar** | 2 pasos: `save-response` + `save-answers` | ❌ 1 paso diferente |
| **Estructura** | `formStructure` (diseño jerárquico) | `questions[]` (plano) |
| **Renderizado** | FormPreviewRenderer (modular) | Lógica inline en FormatScreen |
| **Correlaciones** | ✅ Soportadas con endpoint dedicado | ❌ No implementadas |
| **Tablas Dinámicas** | ✅ Repeater funcional completo | ⚠️ Implementación parcial |
| **Firma/Facial** | ✅ Componentes reutilizables | ✅ Implementados pero diferentes |
| **Offline** | ❌ Siempre online | ✅ AsyncStorage (pero mal implementado) |
| **Estado** | React hooks + useCallback optimizados | useReducer (32 states → 1) |

---

## ⚠️ PROBLEMAS IDENTIFICADOS EN MÓVIL

### 1. **Endpoints Diferentes**
- Móvil usa endpoints propios que no coinciden con PC
- Móvil NO usa `/forms/{id}/form_design` (crucial)

### 2. **Estructura de Datos Incompatible**
```javascript
// PC usa:
formStructure = [
  { id: "field_1", type: "input", props: {...}, questionId: 123 }
]

// Móvil usa:
questions = [
  { id: 123, question_text: "...", question_type: "input" }
]
```

### 3. **Renderizado No Modular**
- PC: `<FormPreviewRenderer formItems={...} />` (2,365 líneas reutilizables)
- Móvil: Lógica de renderizado mezclada en FormatScreen (3,400 líneas monolíticas)

### 4. **Sin Soporte para Diseño Avanzado**
- PC soporta layouts anidados (vertical-layout, horizontal-layout)
- PC soporta tablas dinámicas con correlaciones
- Móvil solo renderiza campos planos

### 5. **AsyncStorage Vacío**
- Dashboard "precarga" pero no valida si hay datos
- FormatScreen crashea cuando AsyncStorage está vacío
- No hay forma de forzar sincronización desde servidor

---

## 🎯 PLAN DE REFACTORIZACIÓN

### **Fase 1: Crear Adaptadores para Móvil** ✅
1. Crear `FormDataAdapter.ts` que convierta:
   - `form_design` (PC) → `formStructure` (móvil)
   - `questions` → Enriquecimiento de formStructure
2. Crear `ResponseAdapter.ts` que formatee:
   - Respuestas móvil → Formato esperado por endpoints PC

### **Fase 2: Portar FormPreviewRenderer a React Native** 🔄
1. Crear `FormRenderer.tsx` (versión móvil de FormPreviewRenderer)
2. Adaptar componentes:
   - HTML → React Native components
   - CSS → StyleSheet
   - Web APIs → React Native APIs
3. Mantener TODA la lógica de renderizado

### **Fase 3: Refactorizar FormatScreen** 🔄
```javascript
// ANTES (3,400 líneas):
- loadAllOfflineData() → AsyncStorage
- Renderizado inline con switch gigante
- Estado con useReducer complejo

// DESPUÉS (300-400 líneas):
- fetchFormData() → Endpoints PC
- <FormRenderer formStructure={...} />
- Estado con useState simple
```

### **Fase 4: Implementar Sistema de Sincronización** ⏳
1. Función `syncFormToCache()` que:
   - Llama a endpoints PC
   - Guarda en AsyncStorage
   - Valida que se guardó correctamente
2. Función `loadFormFromCache()` con fallback:
   - Intenta cargar de AsyncStorage
   - Si falla → syncFormToCache()
   - Si sigue fallando → Mostrar error

### **Fase 5: Testing** ⏳
1. Probar cada tipo de campo
2. Probar tablas dinámicas
3. Probar firma + facial
4. Probar envío de respuestas
5. Probar modo offline

---

## 📝 CÓDIGO DE REFERENCIA CLAVE

### **PC: Función que Enriquece Diseño**
```typescript
// forms_sfi/src/components/list_forms/ListForms.tsx:473
const enrichFormDesignWithQuestions = useCallback(async (
  formDesign: any,
  questionsMap: Record<number, any>
): Promise<{ enrichedDesign: any[], correlations: Record<string, any> }> => {
  // 1. Recorre formDesign recursivamente
  // 2. Busca questionId en cada item
  // 3. Enriquece con datos de questionsMap
  // 4. Obtiene correlaciones si es tabla
  // 5. Retorna diseño + correlaciones
});
```

### **PC: Función de Envío**
```typescript
// forms_sfi/src/components/list_forms/ListForms.tsx:715
const handleSubmitForm = useCallback(async (e, action) => {
  // 1. Validar campos requeridos
  // 2. POST /responses/save-response → Obtener response_id
  // 3. Promise.all( responses.map(r => POST /responses/save-answers) )
  // 4. Si tiene archivos → POST /responses/upload-file
  // 5. Limpiar formulario y mostrar éxito
});
```

### **PC: Renderizado de Campo**
```typescript
// forms_sfi/src/components/form-builder/FormPreviewRenderer.tsx:1800+
const renderFormItem = (item: FormItem): React.ReactNode => {
  switch(item.type) {
    case 'input': return <InputField {...item.props} />;
    case 'select': return <SelectField {...item.props} correlations={...} />;
    case 'firm': return <FirmField {...item.props} />;
    // ... 20+ tipos
  }
};
```

---

## 🚀 PRÓXIMOS PASOS INMEDIATOS

1. **Crear archivo `FormDataAdapter.ts`** en móvil
   - Convertir `form_design` a estructura usable en React Native
   
2. **Crear archivo `FormRenderer.tsx`** en móvil
   - Portar lógica de FormPreviewRenderer
   - Usar componentes de React Native

3. **Modificar `FormatScreen.jsx`**:
   - Eliminar 90% del código actual
   - Usar endpoints de PC
   - Delegar renderizado a FormRenderer

4. **Testing incremental** con un formulario simple

---

## 📌 NOTAS IMPORTANTES

- **NO** intentar mantener compatibilidad con versión actual de móvil
- **SÍ** usar endpoints y lógica de PC al 100%
- **SÍ** mantener soporte offline (AsyncStorage) como CACHÉ, no como fuente principal
- **SÍ** implementar validación real de que AsyncStorage tiene datos
- **NO** usar `router.push()` → Usar `router.replace()`
- **SÍ** mantener debug system actual (es útil)

---

## 🎯 RESULTADO ESPERADO

```javascript
// FormatScreen.jsx DESPUÉS (simplificado):

export default function FormatScreen() {
  const { id } = useLocalSearchParams();
  const [formData, setFormData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadFormData(id);
  }, [id]);
  
  const loadFormData = async (formId) => {
    try {
      // 1. Obtener form_design y questions desde endpoints PC
      const [design, questions] = await Promise.all([
        api.get(`/forms/${formId}/form_design`),
        api.get(`/forms/${formId}/questions`)
      ]);
      
      // 2. Enriquecer y adaptar
      const formStructure = FormDataAdapter.enrich(design.data, questions.data);
      
      // 3. Guardar en AsyncStorage para offline
      await AsyncStorage.setItem(`form_${formId}`, JSON.stringify(formStructure));
      
      setFormData(formStructure);
    } catch (error) {
      // Fallback a AsyncStorage si hay error
      const cached = await AsyncStorage.getItem(`form_${formId}`);
      if (cached) setFormData(JSON.parse(cached));
      else showError("No hay datos disponibles");
    } finally {
      setLoading(false);
    }
  };
  
  const handleSubmit = async (values) => {
    // Usar lógica de PC exactamente
    const responseId = await api.post(`/responses/save-response/${id}`, values);
    await Promise.all(values.map(v => api.post('/responses/save-answers', v)));
    showSuccess("Formulario enviado");
    router.replace("/home");
  };
  
  return (
    <Screen>
      {loading ? (
        <ActivityIndicator />
      ) : (
        <FormRenderer
          formStructure={formData}
          onSubmit={handleSubmit}
        />
      )}
    </Screen>
  );
}
```

**Líneas de código**: ~150 líneas vs 3,400 actuales
**Mantenibilidad**: ✅ Alta (reutiliza lógica de PC)
**Performance**: ✅ Mejor (menos re-renders)
**Bugs**: ✅ Menos (lógica probada en PC)
