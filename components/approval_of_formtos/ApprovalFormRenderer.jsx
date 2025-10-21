import React, { useEffect, useState, useRef, useCallback } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    Modal,
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialIcons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import * as DocumentPicker from "expo-document-picker";

const { width, height } = Dimensions.get("window");
const FORM_SUBMISSIONS_PENDING_KEY = "form_submissions_pending";
const BACKEND_URL_KEY = "backend_url";

const getBackendUrl = async () => {
    const stored = await AsyncStorage.getItem(BACKEND_URL_KEY);
    return stored || "";
};

export default function ApprovalFormRenderer({
    isOpen,
    onClose,
    formToFill,
    onFormSubmitted,
    parentResponseId,
    approvalRequirementId,
}) {
    const [formStructure, setFormStructure] = useState(null);
    const [styleConfig, setStyleConfig] = useState(null);
    const [formValues, setFormValues] = useState({});
    const [selectedFiles, setSelectedFiles] = useState({});
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [loadingForm, setLoadingForm] = useState(false);
    const [isOffline, setIsOffline] = useState(false);
    const [questions, setQuestions] = useState([]);
    const [correlations, setCorrelations] = useState({});
    const [successMessage, setSuccessMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [expandedSelects, setExpandedSelects] = useState({});

    const unsubscribeRef = useRef(null);
    const apiCache = useRef({});

    // ============ FUNCIONES PRINCIPALES ============

    const extractStyleConfig = useCallback((formDesign) => {
        if (!formDesign || Object.keys(formDesign).length === 0) {
            return null;
        }

        if (Array.isArray(formDesign)) {
            for (const item of formDesign) {
                if (item.props && item.props.styleConfig) {
                    return item.props.styleConfig;
                }
                if (item.headerTable && !item.type && !item.props) {
                    return item;
                }
            }
        }

        if (typeof formDesign === 'object') {
            if (formDesign.styleConfig) {
                return formDesign.styleConfig;
            }
            if (formDesign.headerTable && !formDesign.type && !formDesign.props) {
                return formDesign;
            }
        }

        return null;
    }, []);

    const filterFormItems = useCallback((formDesign) => {
        return formDesign.filter(item => {
            if (item.type && item.props) {
                return true;
            }
            if (item.headerTable && !item.type && !item.props) {
                return false;
            }
            return true;
        });
    }, []);

    const cleanStyleConfigFromItems = useCallback((formItems) => {
        return formItems.map(item => {
            if (item.props && item.props.styleConfig) {
                const cleanedItem = {
                    ...item,
                    props: { ...item.props }
                };
                delete cleanedItem.props.styleConfig;
                return cleanedItem;
            }
            return item;
        });
    }, []);

    const enrichFormDesignOptions = useCallback(async (formDesign, token, backendUrl) => {
        return await Promise.all(
            formDesign.map(async (item) => {
                const { type, props } = item;

                if (
                    type === "select" &&
                    props?.dataSource === "pregunta_relacionada" &&
                    props?.sourceQuestionId
                ) {
                    try {
                        const response = await fetch(
                            `${backendUrl}/questions/question-table-relation/answers/${props.sourceQuestionId}`,
                            {
                                method: "GET",
                                headers: {
                                    Authorization: `Bearer ${token}`,
                                },
                            }
                        );

                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }

                        const data = await response.json();
                        const respuestas = Array.isArray(data.respuestas || data.data)
                            ? (data.respuestas || data.data)
                            : [];

                        const options = respuestas.map((r) => r.name);

                        return {
                            ...item,
                            props: {
                                ...props,
                                options,
                            },
                        };
                    } catch (error) {
                        console.error(`Error obteniendo opciones para sourceQuestionId ${props.sourceQuestionId}:`, error);
                        return item;
                    }
                }

                return item;
            })
        );
    }, []);

    const enrichFormItemsWithRelatedAnswers = useCallback((formItems, questions) => {
        return formItems.map(item => {
            if (item.type === 'location') {
                const relatedQuestion = questions.find(q => q.id === item.linkExternalId);

                if (relatedQuestion && relatedQuestion.related_answers) {
                    const enrichedItem = {
                        ...item,
                        props: {
                            ...item.props,
                            relatedAnswers: relatedQuestion.related_answers
                        }
                    };
                    return enrichedItem;
                }
            }
            return item;
        });
    }, []);

    const getAllCorrelationsFromSelectFields = useCallback(async (formDesign, token, backendUrl) => {
        console.log("Iniciando recopilación de correlaciones...");
        let allCorrelations = {};

        const findSelectFieldsWithRelations = (items) => {
            let selectFields = [];

            items.forEach(item => {
                if (item.type === 'select' &&
                    item.props?.dataSource === 'pregunta_relacionada' &&
                    item.props?.sourceQuestionId) {
                    selectFields.push(item);
                } else if (item.children && item.children.length > 0) {
                    selectFields = selectFields.concat(findSelectFieldsWithRelations(item.children));
                }
            });

            return selectFields;
        };

        const selectFieldsWithRelations = findSelectFieldsWithRelations(formDesign);

        for (const selectField of selectFieldsWithRelations) {
            const sourceQuestionId = selectField.props.sourceQuestionId;

            try {
                const response = await fetch(
                    `${backendUrl}/questions/question-table-relation/answers/${sourceQuestionId}`,
                    {
                        method: "GET",
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    }
                );

                if (!response.ok) {
                    throw new Error(`Error HTTP! Estado: ${response.status}`);
                }

                const data = await response.json();

                if (data.correlations) {
                    allCorrelations = { ...allCorrelations, ...data.correlations };
                }
            } catch (error) {
                console.error(`Error obteniendo correlaciones para sourceQuestionId ${sourceQuestionId}:`, error);
            }
        }

        return allCorrelations;
    }, []);

    const processFormItem = useCallback(async (item, parentRepeaterId = null) => {
        if (item.type === 'verticalLayout' || item.type === 'horizontalLayout') {
            const childResponses = await Promise.all(
                (item.children || []).flatMap((child) => processFormItem(child, parentRepeaterId))
            );
            return childResponses.flat();
        }

        if (['label', 'helpText', 'divider', 'button', 'image'].includes(item.type)) {
            return [];
        }

        const itemId = item.id;
        const value = formValues[itemId];
        const props = item.props || {};
        const questionId = item.linkExternalId || itemId;

        if (item.type === 'repeater') {
            const repeaterValues = value || [];

            if (props.required && (!repeaterValues || repeaterValues.length === 0)) {
                setErrors(prev => ({ ...prev, [itemId]: true }));
                return [];
            }

            const repeaterResponses = [];
            for (let rowIndex = 0; rowIndex < repeaterValues.length; rowIndex++) {
                const rowData = repeaterValues[rowIndex] || {};

                const childResponses = await Promise.all(
                    (item.children || []).flatMap((childField) =>
                        processFormItemInsideRepeater(childField, rowData, itemId, rowIndex)
                    )
                );

                repeaterResponses.push(...childResponses.flat());
            }

            return repeaterResponses;
        }

        if (props.required && !value && item.type !== 'file') {
            setErrors(prev => ({ ...prev, [itemId]: true }));
        }

        if (item.type === 'file') {
            const file = selectedFiles[itemId];

            if (props.required && !file) {
                setErrors(prev => ({ ...prev, [itemId]: true }));
                return [];
            }

            if (file) {
                try {
                    const token = await AsyncStorage.getItem("authToken");
                    const backendUrl = await getBackendUrl();

                    const uploadFormData = new FormData();
                    uploadFormData.append("file", {
                        uri: file.uri,
                        name: file.name,
                        type: file.type,
                    });

                    const uploadResponse = await fetch(
                        `${backendUrl}/responses/upload-file/`,
                        {
                            method: "POST",
                            headers: { Authorization: `Bearer ${token}` },
                            body: uploadFormData,
                        }
                    );

                    if (!uploadResponse.ok) {
                        throw new Error("Error al subir el archivo");
                    }

                    const uploadResult = await uploadResponse.json();
                    const filePath = uploadResult.file_name;

                    const response = {
                        question_id: questionId,
                        response: "",
                        file_path: filePath,
                    };

                    if (parentRepeaterId) {
                        response.repeated_id = parentRepeaterId;
                    }

                    return [response];
                } catch (error) {
                    console.error("Error al subir archivo:", error);
                    setErrors(prev => ({ ...prev, [itemId]: true }));
                    return [];
                }
            }

            return [];
        }

        const response = {
            question_id: questionId,
            response: value || "",
            file_path: "",
        };

        if (parentRepeaterId) {
            response.repeated_id = parentRepeaterId;
        }

        return [response];
    }, [formValues, selectedFiles]);

    const processFormItemInsideRepeater = useCallback(async (
        childField,
        rowData,
        repeaterId,
        rowIndex
    ) => {
        const fieldKey = childField.id;
        const fieldValue = rowData[fieldKey];
        const fieldProps = childField.props || {};
        const childQuestionId = childField.linkExternalId || fieldKey;

        if (fieldProps.required && (!fieldValue || fieldValue.toString().trim() === '')) {
            setErrors(prev => ({ ...prev, [`${repeaterId}_row_${rowIndex}_${fieldKey}`]: true }));
        }

        if (childField.type === 'file') {
            const fileKey = `${repeaterId}_${rowIndex}_${fieldKey}`;
            const file = selectedFiles[fileKey];

            if (fieldProps.required && !file) {
                setErrors(prev => ({ ...prev, [`${repeaterId}_row_${rowIndex}_${fieldKey}`]: true }));
                return [];
            }

            if (file) {
                try {
                    const token = await AsyncStorage.getItem("authToken");
                    const backendUrl = await getBackendUrl();

                    const uploadFormData = new FormData();
                    uploadFormData.append("file", {
                        uri: file.uri,
                        name: file.name,
                        type: file.type,
                    });

                    const uploadResponse = await fetch(
                        `${backendUrl}/responses/upload-file/`,
                        {
                            method: "POST",
                            headers: { Authorization: `Bearer ${token}` },
                            body: uploadFormData,
                        }
                    );

                    if (!uploadResponse.ok) {
                        throw new Error("Error al subir el archivo");
                    }

                    const uploadResult = await uploadResponse.json();
                    const filePath = uploadResult.file_name;

                    return [{
                        question_id: childQuestionId,
                        response: "",
                        file_path: filePath,
                        repeated_id: repeaterId,
                        repeater_row_index: rowIndex
                    }];
                } catch (error) {
                    console.error("Error al subir archivo en repeater:", error);
                    setErrors(prev => ({ ...prev, [`${repeaterId}_row_${rowIndex}_${fieldKey}`]: true }));
                    return [];
                }
            }

            return [];
        }

        return [{
            question_id: childQuestionId,
            response: fieldValue || "",
            file_path: "",
            repeated_id: repeaterId,
            repeater_row_index: rowIndex
        }];
    }, [selectedFiles]);

    const createResponseApprovalRequirement = useCallback(async (
        responseId,
        token,
        backendUrl
    ) => {
        if (!parentResponseId || !approvalRequirementId) {
            console.log("Sin datos de contexto para requisito");
            return;
        }

        try {
            const requestBody = {
                requirements: [
                    {
                        response_id: parentResponseId,
                        approval_requirement_id: approvalRequirementId,
                        fulfilling_response_id: responseId,
                        is_fulfilled: true,
                    },
                ],
            };

            const res = await fetch(
                `${backendUrl}/approvers/response-approval-requirements/create`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(requestBody),
                }
            );

            if (!res.ok && res.status !== 400) {
                throw new Error("Error creando registro de requisito");
            }

            console.log("Registro de ResponseApprovalRequirement creado");
            return true;
        } catch (error) {
            console.error("Error creando registro de requisito:", error);
            return false;
        }
    }, [parentResponseId, approvalRequirementId]);

    const savePendingSubmission = useCallback(async (submission) => {
        try {
            const stored = await AsyncStorage.getItem(
                FORM_SUBMISSIONS_PENDING_KEY
            );
            const submissions = stored ? JSON.parse(stored) : [];
            submissions.push({
                ...submission,
                timestamp: Date.now(),
            });

            await AsyncStorage.setItem(
                FORM_SUBMISSIONS_PENDING_KEY,
                JSON.stringify(submissions)
            );

            console.log("Envío guardado para sincronización posterior");
        } catch (e) {
            console.error("Error guardando envío pendiente:", e);
        }
    }, []);

    // ============ EFECTOS ============

    useEffect(() => {
        const unsubscribe = NetInfo.addEventListener((state) => {
            setIsOffline(!state.isConnected);
        });
        unsubscribeRef.current = unsubscribe;

        return () => {
            if (unsubscribeRef.current) {
                unsubscribeRef.current();
            }
        };
    }, []);

    useEffect(() => {
        if (isOpen && formToFill) {
            loadFormStructure();
        }
    }, [isOpen, formToFill]);

    useEffect(() => {
        if (successMessage) {
            const timer = setTimeout(() => setSuccessMessage(""), 5000);
            return () => clearTimeout(timer);
        }
    }, [successMessage]);

    useEffect(() => {
        if (errorMessage) {
            const timer = setTimeout(() => setErrorMessage(""), 5000);
            return () => clearTimeout(timer);
        }
    }, [errorMessage]);

    // ============ CARGAR ESTRUCTURA ============

    const loadFormStructure = useCallback(async () => {
        if (!formToFill) return;

        setLoadingForm(true);

        try {
            const token = await AsyncStorage.getItem("authToken");
            if (!token) throw new Error("No authentication token found");
            const backendUrl = await getBackendUrl();

            const response = await fetch(`${backendUrl}/forms/${formToFill.id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (!response.ok) throw new Error("Error al cargar formulario");

            const data = await response.json();
            console.log("Respuesta del servidor:", data);

            if (data.form_design) {
                const extractedStyleConfig = extractStyleConfig(data.form_design);
                const enrichedFormDesign = await enrichFormDesignOptions(
                    data.form_design,
                    token,
                    backendUrl
                );
                const filteredFormItems = filterFormItems(enrichedFormDesign);
                const cleanedFormItems = cleanStyleConfigFromItems(filteredFormItems);

                let finalFormItems = cleanedFormItems;
                if (data.questions && data.questions.length > 0) {
                    console.log("Enriqueciendo formItems con related_answers...");
                    finalFormItems = enrichFormItemsWithRelatedAnswers(
                        cleanedFormItems,
                        data.questions
                    );
                }

                console.log("Obteniendo correlaciones de campos select...");
                const allCorrelations = await getAllCorrelationsFromSelectFields(
                    enrichedFormDesign,
                    token,
                    backendUrl
                );
                setCorrelations(allCorrelations);

                setFormStructure(finalFormItems);

                if (extractedStyleConfig) {
                    setStyleConfig(extractedStyleConfig);
                } else if (data.style_config) {
                    setStyleConfig(data.style_config);
                } else {
                    setStyleConfig(null);
                }

                if (data.questions && data.questions.length > 0) {
                    setQuestions(data.questions);
                } else {
                    setQuestions([]);
                }

                setFormValues({});
                setErrors({});
                setSelectedFiles({});
            } else {
                console.warn("No se encontró form_design en la respuesta");
                setFormStructure([]);
            }
        } catch (error) {
            console.error("Error cargando estructura del formulario:", error);
            Alert.alert("Error", "No se pudo cargar el formulario");
        } finally {
            setLoadingForm(false);
        }
    }, [formToFill, extractStyleConfig, enrichFormDesignOptions, filterFormItems, cleanStyleConfigFromItems, enrichFormItemsWithRelatedAnswers, getAllCorrelationsFromSelectFields]);

    const handleFileSelect = useCallback(async (questionId, file) => {
        if (!file) return;

        try {
            setSelectedFiles(prev => ({
                ...prev,
                [questionId]: {
                    name: file.name,
                    uri: file.uri,
                    type: file.mimeType || "application/octet-stream",
                    size: file.size,
                }
            }));

            setFormValues(prev => ({
                ...prev,
                [questionId]: file.name,
            }));
        } catch (error) {
            console.error("Error seleccionando archivo:", error);
            Alert.alert("Error", "Error al seleccionar archivo");
        }
    }, []);

    const handleSubmitForm = useCallback(async () => {
        if (!formToFill || !formStructure) return;

        setLoading(true);
        setErrorMessage("");
        setSuccessMessage("");

        if (formStructure.length === 0) {
            setErrorMessage("Este formulario no tiene una estructura válida.");
            setLoading(false);
            return;
        }

        try {
            const token = await AsyncStorage.getItem("authToken");
            if (!token) throw new Error("No authentication token found");
            const backendUrl = await getBackendUrl();

            const allResponses = await Promise.all(
                formStructure.flatMap((item) => processFormItem(item, null))
            );
            const responses = allResponses.flat();

            console.log("Respuestas procesadas:", responses);

            const hasAtLeastOneValidResponse = responses.some((r) => {
                if (typeof r.response === 'string') {
                    return r.response.trim() !== "" || r.file_path !== "";
                } else if (r.response && typeof r.response === 'object') {
                    return JSON.stringify(r.response) !== '{}' || r.file_path !== "";
                }
                return r.file_path !== "";
            });

            if (!hasAtLeastOneValidResponse) {
                setErrorMessage("Por favor, responde al menos una pregunta antes de enviar");
                setLoading(false);
                return;
            }

            const net = await NetInfo.fetch();

            if (net.isConnected) {
                const saveRes = await fetch(
                    `${backendUrl}/responses/save-response/${formToFill.id}?action=send_and_close`,
                    {
                        method: "POST",
                        headers: {
                            Authorization: `Bearer ${token}`,
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify(responses),
                    }
                );

                if (!saveRes.ok) throw new Error("Error guardando respuestas");

                const data = await saveRes.json();
                const responseId = data.response_id;

                await Promise.all(
                    responses.map(async (response) => {
                        const answerText =
                            typeof response.response === "string"
                                ? response.response
                                : JSON.stringify(response.response);

                        const answerBody = {
                            question_id: response.question_id,
                            answer_text: answerText,
                            file_path: response.file_path,
                            response_id: responseId,
                        };

                        if (response.repeated_id) {
                            answerBody.repeated_id = response.repeated_id;
                        }

                        return fetch(
                            `${backendUrl}/responses/save-answers/?action=send_and_close`,
                            {
                                method: "POST",
                                headers: {
                                    Authorization: `Bearer ${token}`,
                                    "Content-Type": "application/json",
                                },
                                body: JSON.stringify(answerBody),
                            }
                        );
                    })
                );

                await createResponseApprovalRequirement(
                    responseId,
                    token,
                    backendUrl
                );

                setSuccessMessage("Formulario enviado exitosamente");
                setTimeout(() => {
                    setFormValues({});
                    setSelectedFiles({});
                    onFormSubmitted();
                    onClose();
                }, 1500);
            } else {
                await savePendingSubmission({
                    formId: formToFill.id,
                    responses,
                    parentResponseId,
                    approvalRequirementId,
                });

                setSuccessMessage(
                    "Formulario guardado. Se sincronizará cuando haya conexión"
                );
                setTimeout(() => {
                    setFormValues({});
                    setSelectedFiles({});
                    onFormSubmitted();
                    onClose();
                }, 1500);
            }
        } catch (error) {
            console.error("Error enviando formulario:", error);
            setErrorMessage("Error al enviar el formulario");
        } finally {
            setLoading(false);
        }
    }, [formToFill, formStructure, processFormItem, createResponseApprovalRequirement, savePendingSubmission, onFormSubmitted, onClose, parentResponseId, approvalRequirementId]);

    // ============ RENDERIZADO ============

    const renderFormItem = useCallback((item) => {
        if (!item) return null;

        const itemId = item.id;
        const value = formValues[itemId] || "";
        const props = item.props || {};
        const hasError = errors[itemId];

        if (item.type === "verticalLayout" || item.type === "horizontalLayout") {
            return (
                <View 
                    key={itemId} 
                    style={item.type === "horizontalLayout" ? styles.horizontalLayout : styles.verticalLayout}
                >
                    {(item.children || []).map(child => renderFormItem(child))}
                </View>
            );
        }

        if (item.type === "label") {
            return (
                <View key={itemId} style={styles.fieldContainer}>
                    <Text style={styles.labelText}>{props.text || props.label || ""}</Text>
                </View>
            );
        }

        if (item.type === "helpText") {
            return (
                <View key={itemId} style={styles.fieldContainer}>
                    <Text style={styles.helpText}>{props.text || ""}</Text>
                </View>
            );
        }

        if (item.type === "divider") {
            return <View key={itemId} style={styles.divider} />;
        }

        if (['button', 'image'].includes(item.type)) {
            return null;
        }

        let fieldType = item.type;
        if (item.type === "input" && props.inputType) {
            fieldType = props.inputType;
        }

        switch (fieldType) {
            case "text":
            case "email":
            case "phone":
            case "input":
                return (
                    <View key={itemId} style={styles.fieldContainer}>
                        <Text style={styles.label}>
                            {props.label || "Campo"}
                            {props.required && (
                                <Text style={styles.requiredAsterisk}> *</Text>
                            )}
                        </Text>
                        <TextInput
                            style={[styles.textInput, hasError && styles.inputError]}
                            placeholder={props.placeholder || `Ingrese ${props.label || "valor"}`}
                            value={value}
                            onChangeText={(text) =>
                                setFormValues((prev) => ({
                                    ...prev,
                                    [itemId]: text,
                                }))
                            }
                            keyboardType={
                                fieldType === "email"
                                    ? "email-address"
                                    : fieldType === "phone"
                                        ? "phone-pad"
                                        : "default"
                            }
                            editable={!loading}
                        />
                    </View>
                );

            case "number":
                return (
                    <View key={itemId} style={styles.fieldContainer}>
                        <Text style={styles.label}>
                            {props.label || "Campo"}
                            {props.required && (
                                <Text style={styles.requiredAsterisk}> *</Text>
                            )}
                        </Text>
                        <TextInput
                            style={[styles.textInput, hasError && styles.inputError]}
                            placeholder={props.placeholder || "Ingrese un número"}
                            value={value}
                            onChangeText={(text) =>
                                setFormValues((prev) => ({
                                    ...prev,
                                    [itemId]: text,
                                }))
                            }
                            keyboardType="numeric"
                            editable={!loading}
                        />
                    </View>
                );

            case "textarea":
                return (
                    <View key={itemId} style={styles.fieldContainer}>
                        <Text style={styles.label}>
                            {props.label || "Campo"}
                            {props.required && (
                                <Text style={styles.requiredAsterisk}> *</Text>
                            )}
                        </Text>
                        <TextInput
                            style={[styles.textInput, styles.textArea, hasError && styles.inputError]}
                            placeholder={props.placeholder || `Ingrese ${props.label || "texto"}`}
                            value={value}
                            onChangeText={(text) =>
                                setFormValues((prev) => ({
                                    ...prev,
                                    [itemId]: text,
                                }))
                            }
                            multiline
                            numberOfLines={4}
                            editable={!loading}
                        />
                    </View>
                );

            case "select":
                return (
                    <View key={itemId} style={styles.fieldContainer}>
                        <Text style={styles.label}>
                            {props.label || "Campo"}
                            {props.required && (
                                <Text style={styles.requiredAsterisk}> *</Text>
                            )}
                        </Text>
                        <TouchableOpacity
                            style={[styles.selectContainer, hasError && styles.inputError]}
                            onPress={() => setExpandedSelects(prev => ({
                                ...prev,
                                [itemId]: !prev[itemId]
                            }))}
                        >
                            <Text style={value ? styles.selectValue : styles.selectPlaceholder}>
                                {value || "Seleccione una opción"}
                            </Text>
                            <MaterialIcons
                                name={expandedSelects[itemId] ? "arrow-drop-up" : "arrow-drop-down"}
                                size={24}
                                color="#6b7280"
                            />
                        </TouchableOpacity>
                        {expandedSelects[itemId] && props.options && props.options.length > 0 && (
                            <View style={styles.optionsContainer}>
                                {props.options.map((option, idx) => (
                                    <TouchableOpacity
                                        key={idx}
                                        style={[
                                            styles.option,
                                            idx === props.options.length - 1 && styles.optionLast,
                                            value === option && styles.optionSelected
                                        ]}
                                        onPress={() => {
                                            setFormValues((prev) => ({
                                                ...prev,
                                                [itemId]: option,
                                            }));
                                            setExpandedSelects(prev => ({
                                                ...prev,
                                                [itemId]: false
                                            }));
                                        }}
                                    >
                                        <Text style={value === option ? styles.optionTextSelected : styles.optionText}>
                                            {option}
                                        </Text>
                                        {value === option && (
                                            <MaterialIcons
                                                name="check"
                                                size={20}
                                                color="#2563eb"
                                            />
                                        )}
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </View>
                );

            case "file":
                return (
                    <View key={itemId} style={styles.fieldContainer}>
                        <Text style={styles.label}>
                            {props.label || "Archivo"}
                            {props.required && (
                                <Text style={styles.requiredAsterisk}> *</Text>
                            )}
                        </Text>
                        <TouchableOpacity
                            style={[styles.fileButton, hasError && styles.inputError]}
                            onPress={async () => {
                                try {
                                    const result = await DocumentPicker.getDocumentAsync({
                                        type: "*/*",
                                        copyToCacheDirectory: true,
                                    });

                                    if (result.type === "success") {
                                        await handleFileSelect(itemId, result);
                                    }
                                } catch (error) {
                                    console.error("Error seleccionando archivo:", error);
                                    Alert.alert("Error", "Error al seleccionar archivo");
                                }
                            }}
                            disabled={loading}
                        >
                            <MaterialIcons name="attach-file" size={20} color="#2563eb" />
                            <Text style={styles.fileButtonText}>
                                {selectedFiles[itemId]
                                    ? selectedFiles[itemId].name
                                    : "Seleccionar archivo"}
                            </Text>
                        </TouchableOpacity>
                    </View>
                );

            case "date":
            case "datetime":
                return (
                    <View key={itemId} style={styles.fieldContainer}>
                        <Text style={styles.label}>
                            {props.label || "Fecha"}
                            {props.required && (
                                <Text style={styles.requiredAsterisk}> *</Text>
                            )}
                        </Text>
                        <TextInput
                            style={[styles.textInput, hasError && styles.inputError]}
                            placeholder={props.placeholder || "DD/MM/AAAA"}
                            value={value}
                            onChangeText={(text) =>
                                setFormValues((prev) => ({
                                    ...prev,
                                    [itemId]: text,
                                }))
                            }
                            editable={!loading}
                        />
                        <Text style={styles.dateHint}>
                            Formato: DD/MM/AAAA
                        </Text>
                    </View>
                );

            case "repeater":
                return (
                    <View key={itemId} style={styles.fieldContainer}>
                        <Text style={styles.label}>
                            {props.label || "Repeater"}
                            {props.required && (
                                <Text style={styles.requiredAsterisk}> *</Text>
                            )}
                        </Text>
                        <View style={styles.repeaterPlaceholder}>
                            <MaterialIcons name="list" size={24} color="#6b7280" />
                            <Text style={styles.repeaterPlaceholderText}>
                                Repeater - Funcionalidad disponible próximamente
                            </Text>
                        </View>
                    </View>
                );

            case "checkbox":
                return (
                    <View key={itemId} style={styles.fieldContainer}>
                        <TouchableOpacity
                            style={styles.checkboxContainer}
                            onPress={() =>
                                setFormValues((prev) => ({
                                    ...prev,
                                    [itemId]: !prev[itemId],
                                }))
                            }
                        >
                            <MaterialIcons
                                name={value ? "check-box" : "check-box-outline-blank"}
                                size={24}
                                color={value ? "#2563eb" : "#d1d5db"}
                            />
                            <Text style={styles.checkboxLabel}>
                                {props.label || "Opción"}
                            </Text>
                        </TouchableOpacity>
                    </View>
                );

            case "radio":
                return (
                    <View key={itemId} style={styles.fieldContainer}>
                        <Text style={styles.label}>{props.label || "Campo"}</Text>
                        {props.options && props.options.map((option, idx) => (
                            <TouchableOpacity
                                key={idx}
                                style={styles.radioContainer}
                                onPress={() =>
                                    setFormValues((prev) => ({
                                        ...prev,
                                        [itemId]: option,
                                    }))
                                }
                            >
                                <MaterialIcons
                                    name={value === option ? "radio-button-checked" : "radio-button-unchecked"}
                                    size={24}
                                    color={value === option ? "#2563eb" : "#d1d5db"}
                                />
                                <Text style={styles.radioLabel}>{option}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                );

            default:
                return (
                    <View key={itemId} style={styles.fieldContainer}>
                        <Text style={styles.label}>
                            {props.label || "Campo"}
                            {props.required && (
                                <Text style={styles.requiredAsterisk}> *</Text>
                            )}
                        </Text>
                        <TextInput
                            style={[styles.textInput, hasError && styles.inputError]}
                            placeholder={props.placeholder || `Ingrese ${props.label || "valor"}`}
                            value={value}
                            onChangeText={(text) =>
                                setFormValues((prev) => ({
                                    ...prev,
                                    [itemId]: text,
                                }))
                            }
                            editable={!loading}
                        />
                    </View>
                );
        }
    }, [formValues, errors, selectedFiles, loading, expandedSelects, handleFileSelect]);

    if (!isOpen || !formToFill) return null;

    return (
        <Modal visible={isOpen} animationType="slide" transparent={false}>
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerContent}>
                        <Text style={styles.headerTitle}>{formToFill.title}</Text>
                        <Text style={styles.headerDescription}>
                            {formToFill.description}
                        </Text>
                        {parentResponseId && approvalRequirementId && (
                            <View style={styles.contextBadge}>
                                <MaterialIcons name="info" size={14} color="#0F8594" />
                                <Text style={styles.contextBadgeText}>
                                    Formato de requisito de aprobación
                                </Text>
                            </View>
                        )}
                    </View>
                    <TouchableOpacity
                        style={styles.closeButton}
                        onPress={onClose}
                        disabled={loading}
                    >
                        <MaterialIcons name="close" size={24} color="#6b7280" />
                    </TouchableOpacity>
                </View>

                {/* Offline indicator */}
                {isOffline && (
                    <View style={styles.offlineIndicator}>
                        <MaterialIcons name="cloud-off" size={16} color="#ef4444" />
                        <Text style={styles.offlineText}>Modo offline</Text>
                    </View>
                )}

                {/* Form content */}
                <ScrollView
                    style={styles.formContainer}
                    contentContainerStyle={styles.formContent}
                >
                    {loadingForm ? (
                        <View style={styles.emptyState}>
                            <ActivityIndicator size="large" color="#0F8594" />
                            <Text style={styles.emptyStateText}>
                                Cargando formulario...
                            </Text>
                        </View>
                    ) : !formStructure || formStructure.length === 0 ? (
                        <View style={styles.emptyState}>
                            <MaterialIcons name="inbox" size={48} color="#9ca3af" />
                            <Text style={styles.emptyStateText}>
                                No hay campos en este formulario
                            </Text>
                        </View>
                    ) : (
                        <>
                            {formStructure.map((item, index) =>
                                renderFormItem(item)
                            )}
                        </>
                    )}

                    {successMessage ? (
                        <View style={styles.successMessage}>
                            <MaterialIcons
                                name="check-circle"
                                size={20}
                                color="#16a34a"
                            />
                            <Text style={styles.successText}>{successMessage}</Text>
                        </View>
                    ) : null}

                    {errorMessage ? (
                        <View style={styles.errorMessage}>
                            <MaterialIcons name="error" size={20} color="#dc2626" />
                            <Text style={styles.errorText}>{errorMessage}</Text>
                        </View>
                    ) : null}
                </ScrollView>

                {/* Footer */}
                {formStructure && formStructure.length > 0 && (
                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={[styles.button, styles.cancelButton]}
                            onPress={onClose}
                            disabled={loading}
                        >
                            <Text style={styles.cancelButtonText}>Cancelar</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                styles.button,
                                styles.submitButton,
                                loading && styles.submitButtonDisabled,
                            ]}
                            onPress={handleSubmitForm}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <>
                                    <MaterialIcons name="check" size={20} color="#fff" />
                                    <Text style={styles.submitButtonText}>Enviar</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#f9fafb",
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        padding: 16,
        backgroundColor: "#fff",
        borderBottomWidth: 1,
        borderBottomColor: "#e5e7eb",
        marginTop: 24,
    },
    headerContent: {
        flex: 1,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: "bold",
        color: "#1f2937",
        marginBottom: 4,
    },
    headerDescription: {
        fontSize: 13,
        color: "#6b7280",
        marginBottom: 8,
    },
    contextBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: "#dbeafe",
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        alignSelf: "flex-start",
    },
    contextBadgeText: {
        fontSize: 12,
        color: "#0F8594",
        fontWeight: "600",
    },
    closeButton: {
        padding: 8,
        marginLeft: 12,
    },
    offlineIndicator: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: "#fee2e2",
        padding: 12,
        marginHorizontal: 16,
        marginTop: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#fecaca",
    },
    offlineText: {
        color: "#dc2626",
        fontWeight: "600",
        fontSize: 13,
    },
    formContainer: {
        flex: 1,
    },
    formContent: {
        padding: 16,
        paddingBottom: 20,
    },
    fieldContainer: {
        marginBottom: 16,
    },
    label: {
        fontSize: 14,
        fontWeight: "600",
        color: "#1f2937",
        marginBottom: 6,
    },
    labelText: {
        fontSize: 16,
        fontWeight: "600",
        color: "#1f2937",
    },
    helpText: {
        fontSize: 13,
        color: "#6b7280",
        fontStyle: "italic",
    },
    dateHint: {
        fontSize: 12,
        color: "#6b7280",
        marginTop: 4,
        fontStyle: "italic",
    },
    requiredAsterisk: {
        color: "#ef4444",
        fontWeight: "bold",
    },
    textInput: {
        borderWidth: 1,
        borderColor: "#d1d5db",
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
        color: "#1f2937",
        backgroundColor: "#fff",
    },
    inputError: {
        borderColor: "#ef4444",
        borderWidth: 2,
    },
    textArea: {
        minHeight: 80,
        textAlignVertical: "top",
    },
    selectContainer: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#d1d5db",
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: "#fff",
    },
    selectValue: {
        flex: 1,
        fontSize: 14,
        color: "#1f2937",
    },
    selectPlaceholder: {
        flex: 1,
        fontSize: 14,
        color: "#9ca3af",
    },
    optionsContainer: {
        marginTop: 8,
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#d1d5db",
        borderRadius: 8,
        paddingVertical: 4,
        maxHeight: 200,
    },
    option: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: "#e5e7eb",
    },
    optionLast: {
        borderBottomWidth: 0,
    },
    optionSelected: {
        backgroundColor: "#f3f4f6",
    },
    optionText: {
        fontSize: 14,
        color: "#1f2937",
        flex: 1,
    },
    optionTextSelected: {
        fontSize: 14,
        color: "#2563eb",
        flex: 1,
        fontWeight: "600",
    },
    fileButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        borderWidth: 1,
        borderColor: "#2563eb",
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 12,
        backgroundColor: "#eff6ff",
    },
    fileButtonText: {
        fontSize: 14,
        color: "#2563eb",
        fontWeight: "500",
        flex: 1,
    },
    checkboxContainer: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 8,
        gap: 12,
    },
    checkboxLabel: {
        fontSize: 14,
        color: "#1f2937",
    },
    radioContainer: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 8,
        gap: 12,
    },
    radioLabel: {
        fontSize: 14,
        color: "#1f2937",
    },
    repeaterPlaceholder: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        padding: 12,
        backgroundColor: "#f3f4f6",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#d1d5db",
        borderStyle: "dashed",
    },
    repeaterPlaceholderText: {
        fontSize: 13,
        color: "#6b7280",
        fontStyle: "italic",
    },
    verticalLayout: {
        marginBottom: 8,
    },
    horizontalLayout: {
        flexDirection: "row",
        gap: 12,
        marginBottom: 8,
    },
    divider: {
        height: 1,
        backgroundColor: "#e5e7eb",
        marginVertical: 16,
    },
    successMessage: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: "#dcfce7",
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#86efac",
        marginTop: 16,
    },
    successText: {
        fontSize: 13,
        color: "#16a34a",
        fontWeight: "600",
        flex: 1,
    },
    errorMessage: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: "#fee2e2",
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#fecaca",
        marginTop: 16,
    },
    errorText: {
        fontSize: 13,
        color: "#dc2626",
        fontWeight: "600",
        flex: 1,
    },
    footer: {
        flexDirection: "row",
        gap: 12,
        padding: 16,
        backgroundColor: "#fff",
        borderTopWidth: 1,
        borderTopColor: "#e5e7eb",
    },
    button: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 12,
        borderRadius: 8,
        gap: 6,
    },
    cancelButton: {
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#d1d5db",
    },
    cancelButtonText: {
        fontSize: 14,
        fontWeight: "600",
        color: "#6b7280",
    },
    submitButton: {
        backgroundColor: "#2563eb",
    },
    submitButtonDisabled: {
        backgroundColor: "#d1d5db",
    },
    submitButtonText: {
        fontSize: 14,
        fontWeight: "600",
        color: "#fff",
    },
    emptyState: {
        justifyContent: "center",
        alignItems: "center",
        paddingVertical: 40,
    },
    emptyStateText: {
        marginTop: 12,
        fontSize: 14,
        color: "#6b7280",
    },
});