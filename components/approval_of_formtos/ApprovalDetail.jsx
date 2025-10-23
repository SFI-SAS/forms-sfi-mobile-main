import React, { useEffect, useState, useRef } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    Dimensions,
    TextInput,
    TouchableOpacity,
    BackHandler,
    Alert,
    Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import NetInfo from "@react-native-community/netinfo";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import ApproversDetailModal from './ApproversDetailModal';
import ApprovalFormRenderer from './ApprovalFormRenderer';

const { width, height } = Dimensions.get("window");
const APPROVALS_OFFLINE_KEY = "approvals_offline";
const APPROVAL_DETAIL_OFFLINE_KEY = "approval_detail_offline";
const APPROVAL_OFFLINE_ACTIONS_KEY = "approvals_offline_actions";
const BACKEND_URL_KEY = "backend_url";

const getBackendUrl = async () => {
    const stored = await AsyncStorage.getItem(BACKEND_URL_KEY);
    return stored || "";
};

export default function ApprovalDetail() {
    const { response_id } = useLocalSearchParams();
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState(null);
    const [accepting, setAccepting] = useState(false);
    const [isOffline, setIsOffline] = useState(false);
    const [showApprovalModal, setShowApprovalModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [showApproversModal, setShowApproversModal] = useState(false);
    const [showFillModal, setShowFillModal] = useState(false);
    const [formToFill, setFormToFill] = useState(null);
    const [showSuccessNotification, setShowSuccessNotification] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [relatedForms, setRelatedForms] = useState([]);
    const router = useRouter();

    const handleAuthError = async (error) => {
        const errorMessage = error?.message || error?.toString() || "";

        // Detectar si es un error de autenticación
        if (
            errorMessage.includes("No authentication token") ||
            errorMessage.includes("authentication token") ||
            errorMessage.includes("Unauthorized") ||
            errorMessage.includes("401")
        ) {
            console.log("🔒 Token inválido o ausente. Cerrando sesión...");

            // Limpiar datos de sesión
            await AsyncStorage.setItem("isLoggedOut", "true");
            await AsyncStorage.removeItem("authToken");

            // Mostrar alerta y redirigir al login
            Alert.alert(
                "Sesión Expirada",
                "Tu sesión ha expirado o no es válida. Por favor, inicia sesión nuevamente.",
                [
                    {
                        text: "Aceptar",
                        onPress: () => router.replace("/"),
                    },
                ],
                { cancelable: false }
            );

            return true; // Indica que se manejó un error de autenticación
        }

        return false; // No es un error de autenticación
    };
    // Bloquea el botón físico de volver atrás
    useEffect(() => {
        const disableBack = () => true;
        const subscription = BackHandler.addEventListener(
            "hardwareBackPress",
            disableBack
        );
        return () => subscription.remove();
    }, []);

    // Agregar después del useEffect que bloquea BackHandler
    useEffect(() => {
        const checkAuthToken = async () => {
            const token = await AsyncStorage.getItem("authToken");
            if (!token) {
                console.log("🔒 No hay token al cargar ApprovalDetail. Redirigiendo al login...");
                Alert.alert(
                    "Sesión no válida",
                    "No se encontró una sesión activa. Por favor, inicia sesión.",
                    [
                        {
                            text: "Aceptar",
                            onPress: () => router.replace("/"),
                        },
                    ],
                    { cancelable: false }
                );
            }
        };

        checkAuthToken();
    }, []);

    useEffect(() => {
        checkConnection();
        loadDetail();
    }, [response_id]);

    const checkConnection = async () => {
        const net = await NetInfo.fetch();
        setIsOffline(!net.isConnected);
    };
    const loadDetail = async (showLoading = true) => {
        if (showLoading) setLoading(true);

        try {
            const net = await NetInfo.fetch();
            setIsOffline(!net.isConnected);

            let foundData = null;

            // Si hay conexión, SIEMPRE traer del servidor primero (datos frescos)
            if (net.isConnected) {
                try {
                    const token = await AsyncStorage.getItem("authToken");

                    // ✅ CAMBIO 1: Verificar token antes de continuar
                    if (!token) {
                        console.log("🔒 No hay token disponible");
                        await handleAuthError(new Error("No authentication token found"));
                        return;
                    }

                    const backendUrl = await getBackendUrl();

                    const res = await fetch(
                        `${backendUrl}/forms/user/assigned-forms-with-responses`,
                        {
                            headers: { Authorization: `Bearer ${token}` },
                        }
                    );

                    // ✅ CAMBIO 2: Verificar si la respuesta es 401 Unauthorized
                    if (res.status === 401) {
                        await handleAuthError(new Error("Unauthorized - Token inválido"));
                        return;
                    }

                    if (res.ok) {
                        const data = await res.json();
                        foundData = Array.isArray(data)
                            ? data.find((f) => String(f.response_id) === String(response_id))
                            : null;

                        if (foundData) {
                            console.log("✅ Datos frescos del servidor - Requisitos:",
                                foundData.approval_requirements);
                            setForm(foundData);
                            loadRelatedForms(foundData);
                            await saveDetailOffline(foundData);
                            setLoading(false);
                            return;
                        }
                    }
                } catch (e) {
                    console.warn("⚠️ Error trayendo datos del servidor:", e);
                    // ✅ CAMBIO 3: Verificar si es error de autenticación
                    const isAuthError = await handleAuthError(e);
                    if (isAuthError) return;
                }
            }

            // Si no hay conexión o falló, usar cache
            if (!foundData) {
                // Busca en memoria offline (detalle específico)
                const storedDetail = await AsyncStorage.getItem(
                    APPROVAL_DETAIL_OFFLINE_KEY
                );
                if (storedDetail) {
                    const arr = JSON.parse(storedDetail);
                    foundData = arr.find((f) => String(f.response_id) === String(response_id));
                    if (foundData) {
                        console.log("📦 Usando cache de detalles");
                        setForm(foundData);
                        loadRelatedForms(foundData);
                        setLoading(false);
                        return;
                    }
                }

                // Si no está en memoria de detalles, busca en la lista general
                const stored = await AsyncStorage.getItem(APPROVALS_OFFLINE_KEY);
                if (stored) {
                    const arr = JSON.parse(stored);
                    foundData = arr.find((f) => String(f.response_id) === String(response_id));
                    if (foundData) {
                        console.log("📦 Usando cache general de aprobaciones");
                        setForm(foundData);
                        loadRelatedForms(foundData);
                        await saveDetailOffline(foundData);
                        setLoading(false);
                        return;
                    }
                }
            }

            // Si no encontró nada en ningún lado
            setForm(null);
        } catch (e) {
            console.error("❌ Error cargando detalle:", e);
            // ✅ CAMBIO 4: Manejar error de autenticación al final
            await handleAuthError(e);
            setForm(null);
        } finally {
            setLoading(false);
        }
    };
    const loadRelatedForms = (currentForm) => {
        // Cargar formularios relacionados del mismo grupo
        AsyncStorage.getItem(APPROVALS_OFFLINE_KEY).then((stored) => {
            if (stored) {
                const arr = JSON.parse(stored);
                const related = arr.filter(
                    (f) =>
                        f.form_id === currentForm.form_id &&
                        f.submitted_by?.user_id === currentForm.submitted_by?.user_id
                );
                setRelatedForms(related);
                const idx = related.findIndex(
                    (f) => String(f.response_id) === String(response_id)
                );
                setCurrentIndex(idx >= 0 ? idx : 0);
            }
        });
    };

    const saveDetailOffline = async (detail) => {
        try {
            const stored = await AsyncStorage.getItem(APPROVAL_DETAIL_OFFLINE_KEY);
            let arr = stored ? JSON.parse(stored) : [];
            arr = arr.filter(
                (f) => String(f.response_id) !== String(detail.response_id)
            );
            arr.push(detail);
            await AsyncStorage.setItem(
                APPROVAL_DETAIL_OFFLINE_KEY,
                JSON.stringify(arr)
            );
            console.log("🟢 Detalle de aprobación guardado offline:", detail);
        } catch (e) {
            console.error("❌ Error guardando detalle offline:", e);
        }
    };

    const saveOfflineApprovalAction = async (
        response_id,
        action,
        message = "",
        files = []
    ) => {
        try {
            const key = APPROVAL_OFFLINE_ACTIONS_KEY;
            const stored = await AsyncStorage.getItem(key);
            const arr = stored ? JSON.parse(stored) : [];
            const now = new Date();
            const reviewed_at = now.toISOString();
            const approver = form.all_approvers.find((ap) => ap.status === "pendiente");
            const selectedSequence = approver?.sequence_number || 1;

            arr.push({
                response_id,
                body: {
                    status: action,
                    reviewed_at,
                    message,
                    selectedSequence,
                },
                files: files.map((f) => ({
                    name: f.name,
                    uri: f.uri,
                    type: f.mimeType || f.type,
                    size: f.size,
                })),
                timestamp: Date.now(),
            });

            await AsyncStorage.setItem(key, JSON.stringify(arr));
            console.log("🟠 Offline approval action saved:", {
                response_id,
                action,
                message,
                selectedSequence,
                filesCount: files.length,
            });
        } catch (e) {
            console.error("❌ Error saving offline action:", e);
        }
    };
    const validateFiles = (files) => {
        const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB por archivo
        const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB total

        if (files.length === 0) return { valid: true };

        const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);

        // Validar archivos individuales
        for (const file of files) {
            if (file.size > MAX_FILE_SIZE) {
                return {
                    valid: false,
                    message: `El archivo "${file.name}" es muy grande. Máximo 10MB por archivo.`
                };
            }
        }

        // Validar tamaño total
        if (totalSize > MAX_TOTAL_SIZE) {
            return {
                valid: false,
                message: `El tamaño total de los archivos (${formatFileSize(totalSize)}) excede el límite de 50MB.`
            };
        }

        return { valid: true };
    };
const handleSubmitApproval = async (status, message, files = []) => {
    if (!form || isSubmitting) return;

    const approver = form.all_approvers.find((ap) => ap.status === "pendiente");
    if (!approver) {
        Alert.alert("Error", "No se encontró un aprobador pendiente.");
        return;
    }
    
    const validation = validateFiles(files);
    if (!validation.valid) {
        Alert.alert("Archivos muy grandes", validation.message);
        return;
    }

    setIsSubmitting(true);

    try {
        const net = await NetInfo.fetch();

        if (!net.isConnected) {
            await saveOfflineApprovalAction(form.response_id, status, message, files);
            Alert.alert(
                "Guardado offline",
                `La ${status === "aprobado" ? "aprobación" : "rechazo"} se guardó y se sincronizará cuando haya conexión.`
            );
            setShowApprovalModal(false);
            router.back();
            return;
        }

        console.log("🌐 Modo online - Verificando token...");
        const token = await AsyncStorage.getItem("authToken");

        if (!token) {
            console.log("❌ No se encontró token");
            await handleAuthError(new Error("No authentication token found"));
            return;
        }

        console.log("✅ Token encontrado:", token.substring(0, 30) + "...");
        const backendUrl = await getBackendUrl();

        console.log("📦 Preparando FormData...");
        const formData = new FormData();
        
        const updateData = {
            status,
            message,
            selectedSequence: approver.sequence_number,
        };

        formData.append("update_data_json", JSON.stringify(updateData));

        if (files && files.length > 0) {
            console.log("📎 Procesando", files.length, "archivo(s)...");
            
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                
                if (!file.uri) {
                    console.warn(`⚠️ Archivo ${i} sin URI - saltando`);
                    continue;
                }

                try {
                    const fileInfo = await FileSystem.getInfoAsync(file.uri);
                    
                    if (!fileInfo.exists) {
                        console.warn(`⚠️ Archivo ${file.name} no existe`);
                        continue;
                    }
                    
                    console.log(`✅ Archivo ${i + 1}/${files.length}: ${file.name} (${formatFileSize(fileInfo.size)})`);
                } catch (fileCheckError) {
                    console.warn(`⚠️ No se pudo verificar ${file.name}`);
                }

                formData.append("files", {
                    uri: file.uri,
                    name: file.name || `archivo_${i + 1}`,
                    type: file.mimeType || file.type || "application/octet-stream",
                });
            }
            
            console.log(`✅ ${files.length} archivo(s) listos para enviar`);
        } else {
            console.log("ℹ️ No hay archivos adjuntos");
        }

        const timeoutDuration = files.length > 0 ? 180000 : 60000;
        console.log(`⏱️ Timeout: ${timeoutDuration / 1000} segundos`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
            console.log(`⏱️ ❌ Timeout alcanzado`);
        }, timeoutDuration);

        const endpoint = `${backendUrl}/approvers/update-response-approval/${form.response_id}`;
        console.log("🚀 Enviando a:", endpoint);

        try {
            const response = await fetch(endpoint, {
                method: "PUT",
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
                body: formData,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            console.log("📥 Respuesta:", response.status, response.statusText);

            if (response.status === 401) {
                console.log("❌ Error 401 - Token inválido");
                
                let errorDetail = "";
                try {
                    const errorText = await response.text();
                    const errorData = JSON.parse(errorText);
                    errorDetail = errorData.detail || errorData.message || "";
                } catch (e) {
                    console.log("No se pudo parsear error 401");
                }
                
                await handleAuthError(new Error(`Unauthorized: ${errorDetail}`));
                return;
            }

            let responseData;
            try {
                const responseText = await response.text();
                console.log("📄 Respuesta:", responseText.substring(0, 200));
                responseData = responseText ? JSON.parse(responseText) : {};
            } catch (parseError) {
                console.error("❌ Error parseando respuesta:", parseError);
                responseData = { detail: "Error al procesar respuesta" };
            }

            if (response.ok) {
                console.log("✅ ¡Aprobación exitosa!");
                Alert.alert(
                    "Éxito",
                    `Formulario ${status === "aprobado" ? "aprobado" : "rechazado"} correctamente.`
                );
                setShowApprovalModal(false);
                router.back();
            } else {
                console.error("❌ Error del servidor:", response.status, responseData);
                throw new Error(responseData?.detail || `Error ${response.status}`);
            }

        } catch (fetchError) {
            clearTimeout(timeoutId);
            
            if (fetchError.name === 'AbortError') {
                console.log("⏱️ ❌ Timeout");
                Alert.alert(
                    "Tiempo agotado",
                    "La petición tardó demasiado. Intente con archivos más pequeños."
                );
                return;
            }
            
            console.error("❌ Error en fetch:", fetchError.message);
            throw fetchError;
        }

    } catch (error) {
        console.error("❌ ERROR:", error.message);
        
        const isAuthError = await handleAuthError(error);

        if (!isAuthError) {
            if (files.length > 0) {
                Alert.alert(
                    "Error al enviar",
                    `No se pudo enviar con archivos: ${error.message}\n\n¿Qué desea hacer?`,
                    [
                        {
                            text: "Intentar de nuevo",
                            style: "cancel"
                        },
                        {
                            text: "Guardar sin archivos",
                            onPress: async () => {
                                await saveOfflineApprovalAction(form.response_id, status, message, []);
                                Alert.alert("Guardado", "Se guardó sin archivos para sincronizar después.");
                                setShowApprovalModal(false);
                                router.back();
                            }
                        }
                    ]
                );
            } else {
                Alert.alert("Error", `No se pudo enviar: ${error.message}\n\nSe guardará offline.`);
                await saveOfflineApprovalAction(form.response_id, status, message, files);
                setShowApprovalModal(false);
                router.back();
            }
        } else {
            setShowApprovalModal(false);
        }

    } finally {
        setIsSubmitting(false);
        console.log("🏁 Finalizado");
    }
};

    useEffect(() => {
        if (showSuccessNotification) {
            const timer = setTimeout(() => {
                setShowSuccessNotification(false);
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [showSuccessNotification]);
    const handleFillForm = async (formId, formTitle, requirementId) => {
        try {
            const token = await AsyncStorage.getItem("authToken");

            // ✅ CAMBIO 1: Verificar token antes de continuar
            if (!token) {
                await handleAuthError(new Error("No authentication token found"));
                return;
            }

            const backendUrl = await getBackendUrl();

            const response = await fetch(`${backendUrl}/forms/${formId}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            // ✅ CAMBIO 2: Verificar si la respuesta es 401 Unauthorized
            if (response.status === 401) {
                await handleAuthError(new Error("Unauthorized - Token inválido"));
                return;
            }

            const formData = await response.json();
            setFormToFill({
                id: formId,
                title: formTitle,
                description: formData.description || "",
                form_design: formData.form_design,
                style_config: formData.style_config,
                questions: formData.questions,
                requirementId: requirementId,
            });

            setShowFillModal(true);
        } catch (error) {
            console.error("Error al cargar formulario:", error);

            // ✅ CAMBIO 3: Verificar si es error de autenticación
            const isAuthError = await handleAuthError(error);

            // Si no es error de autenticación, mostrar alerta genérica
            if (!isAuthError) {
                Alert.alert("Error", "Error al cargar el formulario");
            }
        }
    };

    const handleFormSubmitted = () => {
        console.log("📝 Formulario requisito completado - Refrescando detalles...");
        // Llamar loadDetail sin mostrar loading para actualizar silenciosamente
        loadDetail(false);
        setShowFillModal(false);
        setFormToFill(null);
        setShowSuccessNotification(true);

    };

    const pickFiles = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: "*/*",
                multiple: true,
                copyToCacheDirectory: true,
            });

            // ✅ CORRECCIÓN: Manejar correctamente archivos múltiples
            if (!result.canceled && result.assets) {
                // DocumentPicker ahora retorna result.assets como array
                const newFiles = result.assets.map(asset => ({
                    uri: asset.uri,
                    name: asset.name,
                    type: asset.mimeType || 'application/octet-stream',
                    size: asset.size,
                    mimeType: asset.mimeType
                }));

                setSelectedFiles((prev) => [...prev, ...newFiles]);
                console.log(`✅ ${newFiles.length} archivo(s) seleccionado(s)`);
            } else if (result.canceled) {
                console.log('📌 Selección de archivos cancelada');
            }
        } catch (error) {
            console.error("❌ Error picking files:", error);
            Alert.alert("Error", "No se pudieron seleccionar los archivos");
        }
    };

    const removeFile = (index) => {
        setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    };


    const calcularDias = (fecha, plazo) => {
        const fechaEnviada = new Date(fecha);
        const hoy = new Date();
        const diferenciaMs = hoy.getTime() - fechaEnviada.getTime();
        const diasPasados = Math.floor(diferenciaMs / (1000 * 60 * 60 * 24));
        const diasRestantes = plazo - diasPasados;
        const vencido = diasPasados > plazo;
        return { diasPasados, diasRestantes, vencido };
    };

    const navigateResponse = (direction) => {
        if (direction === "next" && currentIndex < relatedForms.length - 1) {
            const nextForm = relatedForms[currentIndex + 1];
            router.replace({
                pathname: "/approval-detail",
                params: { response_id: nextForm.response_id },
            });
        } else if (direction === "prev" && currentIndex > 0) {
            const prevForm = relatedForms[currentIndex - 1];
            router.replace({
                pathname: "/approval-detail",
                params: { response_id: prevForm.response_id },
            });
        }
    };

    const hasUnfulfilledRequirements = () => {
        if (!form?.approval_requirements?.has_requirements) {
            return false;
        }
        return form.approval_requirements.requirements.some(
            (req) => !req.fulfillment_status.is_fulfilled
        );
    };

    if (loading) {
        return (
            <LinearGradient colors={["#f7fafc", "#e6fafd"]} style={{ flex: 1 }}>
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#12A0AF" />
                    <Text style={styles.loadingText}>Cargando detalle...</Text>
                </View>
            </LinearGradient>
        );
    }

    if (!form) {
        return (
            <LinearGradient colors={["#f7fafc", "#e6fafd"]} style={{ flex: 1 }}>
                <View style={styles.centerContainer}>
                    <MaterialIcons name="error" size={48} color="#ef4444" />
                    <Text style={styles.errorText}>No se encontró el formulario.</Text>
                </View>
            </LinearGradient>
        );
    }

    const { diasPasados, diasRestantes, vencido } = calcularDias(
        form.submitted_at,
        form.deadline_days
    );
    const hasUnfulfilledReqs = hasUnfulfilledRequirements();

    return (
        <LinearGradient colors={["#f7fafc", "#e6fafd"]} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={styles.container}>
                {/* Header */}
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => router.back()}
                >
                    <MaterialIcons name="arrow-back" size={24} color="#4B34C7" />
                    <Text style={styles.backButtonText}>Volver a la lista</Text>
                </TouchableOpacity>

                {/* Offline indicator */}
                {isOffline && (
                    <View style={styles.offlineIndicator}>
                        <MaterialIcons name="cloud-off" size={20} color="#ef4444" />
                        <Text style={styles.offlineText}>Modo offline</Text>
                    </View>
                )}

                {/* Form Info Card */}
                <View style={styles.card}>
                    <View style={styles.headerRow}>
                        <View style={styles.iconContainer}>
                            <MaterialIcons name="description" size={32} color="#fff" />
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.title}>{form.form_title}</Text>
                            <Text style={styles.desc}>{form.form_description}</Text>
                        </View>
                    </View>

                    {/* Info Grid */}
                    <View style={styles.infoGrid}>
                        <View style={[styles.infoBox, { backgroundColor: "#dbeafe" }]}>
                            <MaterialIcons name="person" size={20} color="#2563eb" />
                            <Text style={styles.infoLabel}>Enviado por</Text>
                            <Text style={styles.infoValue}>{form.submitted_by.name}</Text>
                        </View>

                        <View style={[styles.infoBox, { backgroundColor: "#dcfce7" }]}>
                            <MaterialIcons name="calendar-today" size={20} color="#16a34a" />
                            <Text style={styles.infoLabel}>Fecha</Text>
                            <Text style={styles.infoValue}>
                                {new Date(form.submitted_at).toLocaleDateString()}
                            </Text>
                        </View>

                        <View style={[styles.infoBox, { backgroundColor: "#f3e8ff" }]}>
                            <MaterialIcons name="tag" size={20} color="#9333ea" />
                            <Text style={styles.infoLabel}>ID</Text>
                            <Text style={styles.infoValue}>#{form.response_id}</Text>
                        </View>

                        <View
                            style={[
                                styles.infoBox,
                                { backgroundColor: vencido ? "#fee2e2" : "#fed7aa" },
                            ]}
                        >
                            <MaterialIcons
                                name="timer"
                                size={20}
                                color={vencido ? "#dc2626" : "#ea580c"}
                            />
                            <Text style={styles.infoLabel}>Plazo</Text>
                            <Text style={[styles.infoValue, { fontSize: 11 }]}>
                                {vencido
                                    ? `Vencido hace ${diasPasados - form.deadline_days} día(s)`
                                    : diasRestantes === 0
                                        ? "Vence hoy"
                                        : `${diasRestantes} días`}
                            </Text>
                        </View>
                    </View>

                    {/* Navigation */}
                    {relatedForms.length > 1 && (
                        <View style={styles.navigationContainer}>
                            <View style={styles.navigationInfo}>
                                <Text style={styles.navigationLabel}>Respuesta</Text>
                                <Text style={styles.navigationNumber}>
                                    {currentIndex + 1}
                                </Text>
                                <Text style={styles.navigationTotal}>
                                    de {relatedForms.length}
                                </Text>
                            </View>

                            <View style={styles.navigationButtons}>
                                <TouchableOpacity
                                    onPress={() => navigateResponse("prev")}
                                    disabled={currentIndex === 0}
                                    style={[
                                        styles.navButton,
                                        currentIndex === 0 && styles.navButtonDisabled,
                                    ]}
                                >
                                    <MaterialIcons
                                        name="chevron-left"
                                        size={24}
                                        color={currentIndex === 0 ? "#9ca3af" : "#4B34C7"}
                                    />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={() => navigateResponse("next")}
                                    disabled={currentIndex === relatedForms.length - 1}
                                    style={[
                                        styles.navButton,
                                        currentIndex === relatedForms.length - 1 &&
                                        styles.navButtonDisabled,
                                    ]}
                                >
                                    <MaterialIcons
                                        name="chevron-right"
                                        size={24}
                                        color={
                                            currentIndex === relatedForms.length - 1
                                                ? "#9ca3af"
                                                : "#4B34C7"
                                        }
                                    />
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    {/* Approval Chain */}
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Cadena de aprobación</Text>
                            <TouchableOpacity
                                onPress={() => setShowApproversModal(true)}
                                style={styles.detailsButton}
                            >
                                <Text style={styles.detailsButtonText}>Ver detalles</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.approversContainer}>
                            {form.all_approvers.map((approver, index) => (
                                <View
                                    key={index}
                                    style={[
                                        styles.approverChip,
                                        {
                                            backgroundColor:
                                                approver.status === "aprobado"
                                                    ? "#dcfce7"
                                                    : approver.status === "rechazado"
                                                        ? "#fee2e2"
                                                        : "#fef3c7",
                                        },
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.approverChipText,
                                            {
                                                color:
                                                    approver.status === "aprobado"
                                                        ? "#15803d"
                                                        : approver.status === "rechazado"
                                                            ? "#dc2626"
                                                            : "#ca8a04",
                                            },
                                        ]}
                                    >
                                        #{approver.sequence_number} {approver.user.name} •{" "}
                                        {approver.status}
                                        {approver.is_mandatory && " (Obligatorio)"}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    </View>

                    {/* Requirements Progress */}
                    {form.approval_requirements?.has_requirements && (
                        <View style={styles.requirementsProgress}>
                            <View style={styles.progressHeader}>
                                <Text style={styles.progressText}>
                                    Requisitos:{" "}
                                    {form.approval_requirements.fulfilled_requirements} de{" "}
                                    {form.approval_requirements.total_requirements} completados
                                </Text>
                                <Text style={styles.progressPercentage}>
                                    {form.approval_requirements.completion_percentage}%
                                </Text>
                            </View>
                            <View style={styles.progressBar}>
                                <View
                                    style={[
                                        styles.progressFill,
                                        {
                                            width: `${form.approval_requirements.completion_percentage}%`,
                                            backgroundColor: form.approval_requirements
                                                .all_requirements_fulfilled
                                                ? "#22c55e"
                                                : "#f59e0b",
                                        },
                                    ]}
                                />
                            </View>
                        </View>
                    )}

                    {/* Action Button */}
                    <TouchableOpacity
                        onPress={() => setShowApprovalModal(true)}
                        disabled={hasUnfulfilledReqs}
                        style={[
                            styles.approveButton,
                            hasUnfulfilledReqs && styles.approveButtonDisabled,
                        ]}
                    >
                        <MaterialIcons
                            name="check-circle"
                            size={24}
                            color="#fff"
                            style={{ marginRight: 8 }}
                        />
                        <Text style={styles.approveButtonText}>
                            {hasUnfulfilledReqs
                                ? "Requisitos pendientes"
                                : "Revisar y aprobar"}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Requirements Section */}
                {form.approval_requirements?.has_requirements && (
                    <View style={styles.requirementsSection}>
                        <View
                            style={[
                                styles.requirementsBanner,
                                {
                                    backgroundColor: form.approval_requirements
                                        .all_requirements_fulfilled
                                        ? "#dcfce7"
                                        : "#fef3c7",
                                    borderColor: form.approval_requirements
                                        .all_requirements_fulfilled
                                        ? "#86efac"
                                        : "#fcd34d",
                                },
                            ]}
                        >
                            <MaterialIcons
                                name={
                                    form.approval_requirements.all_requirements_fulfilled
                                        ? "check-circle"
                                        : "warning"
                                }
                                size={24}
                                color={
                                    form.approval_requirements.all_requirements_fulfilled
                                        ? "#16a34a"
                                        : "#f59e0b"
                                }
                            />
                            <View style={{ flex: 1, marginLeft: 12 }}>
                                <Text
                                    style={[
                                        styles.requirementsBannerTitle,
                                        {
                                            color: form.approval_requirements
                                                .all_requirements_fulfilled
                                                ? "#15803d"
                                                : "#ca8a04",
                                        },
                                    ]}
                                >
                                    {form.approval_requirements.all_requirements_fulfilled
                                        ? "✓ Todos los requisitos están completados"
                                        : `${form.approval_requirements.pending_requirements} requisito(s) pendiente(s)`}
                                </Text>
                                <Text
                                    style={[
                                        styles.requirementsBannerSubtitle,
                                        {
                                            color: form.approval_requirements
                                                .all_requirements_fulfilled
                                                ? "#16a34a"
                                                : "#d97706",
                                        },
                                    ]}
                                >
                                    {form.approval_requirements.fulfilled_requirements} de{" "}
                                    {form.approval_requirements.total_requirements} formatos
                                    completados
                                </Text>
                            </View>
                        </View>

                        {form.approval_requirements.requirements.map((req, idx) => (
                            <View key={idx} style={styles.requirementCard}>
                                <View style={styles.requirementHeader}>
                                    <View
                                        style={[
                                            styles.requirementIcon,
                                            {
                                                backgroundColor: req.fulfillment_status.is_fulfilled
                                                    ? "#dcfce7"
                                                    : "#f3f4f6",
                                            },
                                        ]}
                                    >
                                        <MaterialIcons
                                            name={
                                                req.fulfillment_status.is_fulfilled
                                                    ? "check-circle"
                                                    : "description"
                                            }
                                            size={24}
                                            color={
                                                req.fulfillment_status.is_fulfilled
                                                    ? "#16a34a"
                                                    : "#6b7280"
                                            }
                                        />
                                    </View>
                                    <View style={{ flex: 1, marginLeft: 12 }}>
                                        <Text style={styles.requirementTitle}>
                                            {req.required_form.form_title}
                                        </Text>
                                        <Text style={styles.requirementDescription}>
                                            {req.required_form.form_description}
                                        </Text>
                                        <View style={styles.requirementMeta}>
                                            <MaterialIcons name="person" size={16} color="#6b7280" />
                                            <Text style={styles.requirementMetaText}>
                                                Responsable: {req.approver.name}
                                            </Text>
                                        </View>
                                        {req.fulfillment_status.is_fulfilled && (
                                            <View style={styles.completedBadge}>
                                                <MaterialIcons
                                                    name="check-circle"
                                                    size={14}
                                                    color="#16a34a"
                                                />
                                                <Text style={styles.completedText}>
                                                    Completado el{" "}
                                                    {req.fulfillment_status.fulfilling_response_submitted_at
                                                        ? new Date(
                                                            req.fulfillment_status.fulfilling_response_submitted_at
                                                        ).toLocaleDateString()
                                                        : "fecha no disponible"}
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                </View>

                                {req.fulfillment_status.is_fulfilled ? (
                                    <View style={styles.completedStatusBadge}>
                                        <Text style={styles.completedStatusText}>
                                            ✓ Completado
                                        </Text>
                                    </View>
                                ) : (
                                    <View style={styles.requirementActions}>
                                        <View style={styles.pendingBadge}>
                                            <Text style={styles.pendingText}>Pendiente</Text>
                                        </View>
                                        <TouchableOpacity
                                            onPress={() =>
                                                handleFillForm(
                                                    req.required_form.form_id,
                                                    req.required_form.form_title,
                                                    req.requirement_id
                                                )
                                            }
                                            style={styles.fillButton}
                                        >
                                            <MaterialIcons
                                                name="edit"
                                                size={18}
                                                color="#fff"
                                                style={{ marginRight: 6 }}
                                            />
                                            <Text style={styles.fillButtonText}>
                                                Llenar formato
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        ))}
                    </View>
                )}

                {/* Answers Section */}
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Respuestas del formulario</Text>

                    {form.answers.length === 0 ? (
                        <View style={styles.emptyAnswers}>
                            <MaterialIcons name="description" size={48} color="#9ca3af" />
                            <Text style={styles.emptyAnswersText}>
                                No hay respuestas registradas
                            </Text>
                        </View>
                    ) : (
                        form.answers.map((answer, index) => (
                            <View key={index} style={styles.answerCard}>
                                <Text style={styles.questionText}>{answer.question_text}</Text>
                                {answer.question_type === "file" && answer.file_path ? (
                                    <TouchableOpacity
                                        onPress={() => {
                                            /* Implementar descarga */
                                        }}
                                        style={styles.fileButton}
                                    >
                                        <MaterialIcons name="attach-file" size={18} color="#2563eb" />
                                        <Text style={styles.fileButtonText}>Descargar archivo</Text>
                                    </TouchableOpacity>
                                ) : (
                                    <Text style={styles.answerText}>
                                        {answer.answer_text || "Sin respuesta"}
                                    </Text>
                                )}
                            </View>
                        ))
                    )}
                </View>
            </ScrollView>

            {/* Approval Modal */}
            <ApprovalModal
                isVisible={showApprovalModal}
                onClose={() => setShowApprovalModal(false)}
                onSubmit={handleSubmitApproval}
                isSubmitting={isSubmitting}
                formTitle={form.form_title}
                submittedBy={form.submitted_by.name}
                sequenceNumber={
                    form.all_approvers.find((ap) => ap.status === "pendiente")
                        ?.sequence_number || 1
                }
                responseNumber={currentIndex + 1}
                totalResponses={relatedForms.length}
                hasUnfulfilledRequirements={hasUnfulfilledReqs}
                selectedFiles={selectedFiles}
                onFilesChange={setSelectedFiles}
                onPickFiles={pickFiles}
                onRemoveFile={removeFile}
            />

            {/* Approvers Detail Modal */}
            <ApproversDetailModal
                isVisible={showApproversModal}
                onClose={() => setShowApproversModal(false)}
                responseId={form.response_id}
                formTitle={form.form_title}
            />

            <ApprovalFormRenderer
                isOpen={showFillModal}
                onClose={() => {
                    setShowFillModal(false);
                    setFormToFill(null);
                }}
                formToFill={formToFill}
                onFormSubmitted={handleFormSubmitted}
                parentResponseId={form?.response_id}
                approvalRequirementId={formToFill?.requirementId}
            />

            {/* Success Notification */}
            {showSuccessNotification && (
                <View style={styles.successNotification}>
                    <View style={styles.successCard}>
                        <MaterialIcons name="check-circle" size={48} color="#16a34a" />
                        <Text style={styles.successTitle}>¡Éxito!</Text>
                        <Text style={styles.successMessage}>
                            El formulario se ha registrado exitosamente
                        </Text>
                    </View>
                </View>
            )}
        </LinearGradient>
    );
}

// Approval Modal Component
function ApprovalModal({
    isVisible,
    onClose,
    onSubmit,
    isSubmitting,
    formTitle,
    submittedBy,
    sequenceNumber,
    responseNumber,
    totalResponses,
    hasUnfulfilledRequirements,
    selectedFiles,
    onFilesChange,
    onPickFiles,
    onRemoveFile,
}) {
    const [approvalStatus, setApprovalStatus] = useState("aprobado");
    const [message, setMessage] = useState("");

    const handleSubmit = () => {
        onSubmit(approvalStatus, message, selectedFiles);
        setMessage("");
        setApprovalStatus("aprobado");
        onFilesChange([]);
    };

    const canApprove = !hasUnfulfilledRequirements;

    return (
        <Modal visible={isVisible} transparent animationType="fade">
            <View style={styles.modalOverlay}>
                <View style={styles.modalContainer}>
                    <ScrollView>
                        {/* Header */}
                        <View style={styles.modalHeader}>
                            <View
                                style={[
                                    styles.modalIconContainer,
                                    {
                                        backgroundColor:
                                            approvalStatus === "aprobado" ? "#dcfce7" : "#fee2e2",
                                    },
                                ]}
                            >
                                <MaterialIcons
                                    name={
                                        approvalStatus === "aprobado" ? "check-circle" : "cancel"
                                    }
                                    size={32}
                                    color={approvalStatus === "aprobado" ? "#16a34a" : "#dc2626"}
                                />
                            </View>
                            <View style={{ flex: 1, marginLeft: 12 }}>
                                <Text style={styles.modalTitle}>Revisar formulario</Text>
                                <Text style={styles.modalSubtitle}>
                                    Secuencia #{sequenceNumber}
                                </Text>
                                {responseNumber && totalResponses && (
                                    <Text style={styles.modalSubtitle}>
                                        Respuesta {responseNumber} de {totalResponses}
                                    </Text>
                                )}
                            </View>
                        </View>

                        {/* Form Info */}
                        <View style={styles.modalFormInfo}>
                            <Text style={styles.modalFormLabel}>Formulario:</Text>
                            <Text style={styles.modalFormTitle}>{formTitle}</Text>
                            <Text style={styles.modalFormMeta}>
                                Enviado por: {submittedBy}
                            </Text>
                        </View>

                        {/* Requirements Warning */}
                        {hasUnfulfilledRequirements && (
                            <View style={styles.modalWarning}>
                                <MaterialIcons name="warning" size={24} color="#f59e0b" />
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text style={styles.modalWarningTitle}>
                                        Hay formatos requeridos pendientes por diligenciar
                                    </Text>
                                    <Text style={styles.modalWarningText}>
                                        No se puede aprobar hasta que se completen todos los
                                        requisitos
                                    </Text>
                                </View>
                            </View>
                        )}

                        {/* Decision */}
                        <View style={styles.modalSection}>
                            <Text style={styles.modalSectionTitle}>
                                Decisión de aprobación
                            </Text>
                            <View style={styles.decisionButtons}>
                                <TouchableOpacity
                                    onPress={() => setApprovalStatus("aprobado")}
                                    disabled={!canApprove}
                                    style={[
                                        styles.decisionButton,
                                        approvalStatus === "aprobado" && canApprove
                                            ? styles.decisionButtonActiveApprove
                                            : styles.decisionButtonInactive,
                                        !canApprove && styles.decisionButtonDisabled,
                                    ]}
                                >
                                    <MaterialIcons
                                        name="check-circle"
                                        size={24}
                                        color={
                                            approvalStatus === "aprobado" && canApprove
                                                ? "#15803d"
                                                : canApprove
                                                    ? "#6b7280"
                                                    : "#d1d5db"
                                        }
                                    />
                                    <Text
                                        style={[
                                            styles.decisionButtonText,
                                            approvalStatus === "aprobado" && canApprove
                                                ? styles.decisionButtonTextActiveApprove
                                                : styles.decisionButtonTextInactive,
                                            !canApprove && styles.decisionButtonTextDisabled,
                                        ]}
                                    >
                                        Aprobar
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={() => setApprovalStatus("rechazado")}
                                    style={[
                                        styles.decisionButton,
                                        approvalStatus === "rechazado"
                                            ? styles.decisionButtonActiveReject
                                            : styles.decisionButtonInactive,
                                    ]}
                                >
                                    <MaterialIcons
                                        name="cancel"
                                        size={24}
                                        color={
                                            approvalStatus === "rechazado" ? "#b91c1c" : "#6b7280"
                                        }
                                    />
                                    <Text
                                        style={[
                                            styles.decisionButtonText,
                                            approvalStatus === "rechazado"
                                                ? styles.decisionButtonTextActiveReject
                                                : styles.decisionButtonTextInactive,
                                        ]}
                                    >
                                        Rechazar
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Comments */}
                        <View style={styles.modalSection}>
                            <Text style={styles.modalSectionTitle}>
                                Comentarios{" "}
                                {approvalStatus === "rechazado" && (
                                    <Text style={{ color: "#ef4444" }}>*</Text>
                                )}
                            </Text>
                            <TextInput
                                value={message}
                                onChangeText={setMessage}
                                placeholder={
                                    approvalStatus === "aprobado"
                                        ? "Comentarios adicionales (opcional)"
                                        : "Explique el motivo del rechazo (requerido)"
                                }
                                multiline
                                numberOfLines={4}
                                style={styles.modalTextArea}
                            />
                        </View>

                        {/* Files */}
                        <View style={styles.modalSection}>
                            <Text style={styles.modalSectionTitle}>
                                Archivos adjuntos{" "}
                                <Text style={styles.optionalLabel}>(opcional)</Text>
                            </Text>

                            <TouchableOpacity
                                onPress={onPickFiles}
                                style={styles.filePickerButton}
                            >
                                <MaterialIcons name="attach-file" size={24} color="#2563eb" />
                                <Text style={styles.filePickerButtonText}>
                                    Seleccionar archivos
                                </Text>
                            </TouchableOpacity>

                            {selectedFiles.length > 0 && (
                                <View style={styles.filesContainer}>
                                    <Text style={styles.filesTitle}>
                                        Archivos seleccionados ({selectedFiles.length}):
                                    </Text>
                                    {selectedFiles.map((file, index) => (
                                        <View key={index} style={styles.fileItem}>
                                            <MaterialIcons
                                                name="insert-drive-file"
                                                size={20}
                                                color="#2563eb"
                                            />
                                            <View style={{ flex: 1, marginLeft: 8 }}>
                                                <Text style={styles.fileName} numberOfLines={1}>
                                                    {file.name}
                                                </Text>
                                                {file.size && (
                                                    <Text style={styles.fileSize}>
                                                        {formatFileSize(file.size)}
                                                    </Text>
                                                )}
                                            </View>
                                            <TouchableOpacity onPress={() => onRemoveFile(index)}>
                                                <MaterialIcons name="close" size={20} color="#ef4444" />
                                            </TouchableOpacity>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </View>
                    </ScrollView>

                    {/* Footer */}
                    <View style={styles.modalFooter}>
                        <TouchableOpacity
                            onPress={onClose}
                            disabled={isSubmitting}
                            style={[styles.modalButton, styles.modalButtonCancel]}
                        >
                            <Text style={styles.modalButtonTextCancel}>Cancelar</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={handleSubmit}
                            disabled={
                                isSubmitting ||
                                (approvalStatus === "rechazado" && !message.trim()) ||
                                (approvalStatus === "aprobado" && !canApprove)
                            }
                            style={[
                                styles.modalButton,
                                approvalStatus === "aprobado"
                                    ? styles.modalButtonApprove
                                    : styles.modalButtonReject,
                                (isSubmitting ||
                                    (approvalStatus === "rechazado" && !message.trim()) ||
                                    (approvalStatus === "aprobado" && !canApprove)) &&
                                styles.modalButtonDisabled,
                            ]}
                        >
                            {isSubmitting ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <>
                                    <Text style={styles.modalButtonTextAction}>
                                        {approvalStatus === "aprobado" ? "Aprobar" : "Rechazar"}{" "}
                                        formulario
                                    </Text>
                                    {selectedFiles.length > 0 && (
                                        <View style={styles.filesBadge}>
                                            <Text style={styles.filesBadgeText}>
                                                +{selectedFiles.length}
                                            </Text>
                                        </View>
                                    )}
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

function formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}



const styles = StyleSheet.create({
    container: {
        padding: width * 0.04,
        paddingBottom: 40,
    },
    centerContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
    },
    loadingText: {
        marginTop: 12,
        color: "#12A0AF",
        fontSize: 16,
        fontWeight: "600",
    },
    errorText: {
        marginTop: 12,
        color: "#ef4444",
        fontSize: 16,
        textAlign: "center",
    },
    backButton: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#fff",
        padding: 12,
        borderRadius: 12,
        marginBottom: 16,
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    backButtonText: {
        marginLeft: 8,
        fontSize: 16,
        fontWeight: "600",
        color: "#4B34C7",
    },
    offlineIndicator: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#fee2e2",
        padding: 12,
        borderRadius: 8,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: "#fecaca",
    },
    offlineText: {
        marginLeft: 8,
        color: "#dc2626",
        fontWeight: "600",
    },
    card: {
        backgroundColor: "#fff",
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 3,
    },
    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 16,
    },
    iconContainer: {
        width: 56,
        height: 56,
        borderRadius: 12,
        backgroundColor: "#0F8492",
        justifyContent: "center",
        alignItems: "center",
    },
    title: {
        fontSize: width * 0.055,
        fontWeight: "bold",
        color: "#1f2937",
    },
    desc: {
        fontSize: width * 0.038,
        color: "#6b7280",
        marginTop: 4,
    },
    infoGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        marginBottom: 16,
    },
    infoBox: {
        flex: 1,
        minWidth: "48%",
        padding: 12,
        borderRadius: 12,
        alignItems: "center",
    },
    infoLabel: {
        fontSize: 11,
        color: "#6b7280",
        marginTop: 4,
    },
    infoValue: {
        fontSize: 13,
        fontWeight: "600",
        color: "#1f2937",
        marginTop: 2,
        textAlign: "center",
    },
    navigationContainer: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: "#e5e7eb",
    },
    navigationInfo: {
        alignItems: "center",
    },
    navigationLabel: {
        fontSize: 12,
        color: "#6b7280",
    },
    navigationNumber: {
        fontSize: 24,
        fontWeight: "bold",
        color: "#1f2937",
    },
    navigationTotal: {
        fontSize: 12,
        color: "#9ca3af",
    },
    navigationButtons: {
        flexDirection: "row",
        gap: 8,
    },
    navButton: {
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: "#fff",
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#e5e7eb",
    },
    navButtonDisabled: {
        backgroundColor: "#f3f4f6",
        borderColor: "#e5e7eb",
    },
    section: {
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: "#e5e7eb",
    },
    sectionHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: width * 0.045,
        fontWeight: "bold",
        color: "#1f2937",
    },
    detailsButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: "#2563eb",
        borderRadius: 8,
    },
    detailsButtonText: {
        color: "#fff",
        fontSize: 12,
        fontWeight: "600",
    },
    approversContainer: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    approverChip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
    },
    approverChipText: {
        fontSize: 12,
        fontWeight: "600",
    },
    requirementsProgress: {
        marginTop: 16,
        padding: 12,
        backgroundColor: "#f9fafb",
        borderRadius: 8,
    },
    progressHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 8,
    },
    progressText: {
        fontSize: 12,
        color: "#6b7280",
    },
    progressPercentage: {
        fontSize: 12,
        fontWeight: "bold",
        color: "#1f2937",
    },
    progressBar: {
        height: 6,
        backgroundColor: "#e5e7eb",
        borderRadius: 3,
        overflow: "hidden",
    },
    progressFill: {
        height: "100%",
        borderRadius: 3,
    },
    approveButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#2563eb",
        padding: 16,
        borderRadius: 12,
        marginTop: 16,
    },
    approveButtonDisabled: {
        backgroundColor: "#d1d5db",
    },
    approveButtonText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "bold",
    },
    requirementsSection: {
        marginBottom: 16,
    },
    requirementsBanner: {
        flexDirection: "row",
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 16,
    },
    requirementsBannerTitle: {
        fontSize: 14,
        fontWeight: "bold",
    },
    requirementsBannerSubtitle: {
        fontSize: 12,
        marginTop: 4,
    },
    requirementCard: {
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: "#e5e7eb",
    },
    requirementHeader: {
        flexDirection: "row",
    },
    requirementIcon: {
        width: 48,
        height: 48,
        borderRadius: 8,
        justifyContent: "center",
        alignItems: "center",
    },
    requirementTitle: {
        fontSize: 16,
        fontWeight: "bold",
        color: "#1f2937",
    },
    requirementDescription: {
        fontSize: 13,
        color: "#6b7280",
        marginTop: 2,
    },
    requirementMeta: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: 8,
        gap: 4,
    },
    requirementMetaText: {
        fontSize: 12,
        color: "#6b7280",
    },
    completedBadge: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: 8,
        gap: 4,
    },
    completedText: {
        fontSize: 11,
        color: "#16a34a",
    },
    completedStatusBadge: {
        marginTop: 12,
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: "#dcfce7",
        borderRadius: 8,
        alignSelf: "flex-start",
    },
    completedStatusText: {
        color: "#15803d",
        fontWeight: "600",
    },
    requirementActions: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 12,
    },
    pendingBadge: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: "#fee2e2",
        borderRadius: 8,
    },
    pendingText: {
        color: "#b91c1c",
        fontWeight: "600",
    },
    fillButton: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: "#2563eb",
        borderRadius: 8,
    },
    fillButtonText: {
        color: "#fff",
        fontWeight: "600",
        fontSize: 13,
    },
    emptyAnswers: {
        alignItems: "center",
        padding: 32,
    },
    emptyAnswersText: {
        marginTop: 12,
        fontSize: 16,
        color: "#6b7280",
    },
    answerCard: {
        backgroundColor: "#f9fafb",
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
    },
    questionText: {
        fontSize: 15,
        fontWeight: "600",
        color: "#1f2937",
        marginBottom: 8,
    },
    answerText: {
        fontSize: 14,
        color: "#4b5563",
    },
    fileButton: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 8,
        gap: 6,
    },
    fileButtonText: {
        color: "#2563eb",
        fontSize: 14,
        fontWeight: "600",
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
    },
    modalContainer: {
        backgroundColor: "#fff",
        borderRadius: 16,
        width: "100%",
        maxHeight: height * 0.85,
        overflow: "hidden",
    },
    modalHeader: {
        flexDirection: "row",
        alignItems: "center",
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: "#e5e7eb",
    },
    modalIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: "center",
        alignItems: "center",
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: "bold",
        color: "#1f2937",
    },
    modalSubtitle: {
        fontSize: 14,
        color: "#6b7280",
        marginTop: 2,
    },
    modalFormInfo: {
        padding: 16,
        backgroundColor: "#f9fafb",
        margin: 16,
        borderRadius: 12,
    },
    modalFormLabel: {
        fontSize: 12,
        color: "#6b7280",
        marginBottom: 4,
    },
    modalFormTitle: {
        fontSize: 16,
        fontWeight: "bold",
        color: "#1f2937",
    },
    modalFormMeta: {
        fontSize: 14,
        color: "#4b5563",
        marginTop: 8,
    },
    modalWarning: {
        flexDirection: "row",
        padding: 16,
        margin: 16,
        backgroundColor: "#fef3c7",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#fde68a",
    },
    modalWarningTitle: {
        fontSize: 14,
        fontWeight: "600",
        color: "#92400e",
    },
    modalWarningText: {
        fontSize: 12,
        color: "#b45309",
        marginTop: 4,
    },
    modalSection: {
        padding: 16,
    },
    modalSectionTitle: {
        fontSize: 14,
        fontWeight: "600",
        color: "#1f2937",
        marginBottom: 12,
    },
    optionalLabel: {
        color: "#9ca3af",
        fontWeight: "400",
    },
    decisionButtons: {
        flexDirection: "row",
        gap: 12,
    },
    decisionButton: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        borderRadius: 12,
        borderWidth: 2,
        gap: 8,
    },
    decisionButtonInactive: {
        borderColor: "#e5e7eb",
        backgroundColor: "#fff",
    },
    decisionButtonActiveApprove: {
        borderColor: "#86efac",
        backgroundColor: "#dcfce7",
    },
    decisionButtonActiveReject: {
        borderColor: "#fca5a5",
        backgroundColor: "#fee2e2",
    },
    decisionButtonDisabled: {
        backgroundColor: "#f3f4f6",
        borderColor: "#e5e7eb",
    },
    decisionButtonText: {
        fontSize: 15,
        fontWeight: "600",
    },
    decisionButtonTextInactive: {
        color: "#6b7280",
    },
    decisionButtonTextActiveApprove: {
        color: "#15803d",
    },
    decisionButtonTextActiveReject: {
        color: "#b91c1c",
    },
    decisionButtonTextDisabled: {
        color: "#d1d5db",
    },
    modalTextArea: {
        borderWidth: 1,
        borderColor: "#d1d5db",
        borderRadius: 12,
        padding: 12,
        fontSize: 14,
        color: "#1f2937",
        minHeight: 100,
        textAlignVertical: "top",
    },
    filePickerButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        borderWidth: 2,
        borderStyle: "dashed",
        borderColor: "#d1d5db",
        borderRadius: 12,
        backgroundColor: "#f9fafb",
        gap: 8,
    },
    filePickerButtonText: {
        color: "#2563eb",
        fontSize: 14,
        fontWeight: "600",
    },
    filesContainer: {
        marginTop: 12,
    },
    filesTitle: {
        fontSize: 13,
        fontWeight: "600",
        color: "#4b5563",
        marginBottom: 8,
    },
    fileItem: {
        flexDirection: "row",
        alignItems: "center",
        padding: 12,
        backgroundColor: "#f9fafb",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        marginBottom: 8,
    },
    fileName: {
        fontSize: 13,
        fontWeight: "500",
        color: "#1f2937",
    },
    fileSize: {
        fontSize: 11,
        color: "#6b7280",
        marginTop: 2,
    },
    modalFooter: {
        flexDirection: "row",
        gap: 12,
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: "#e5e7eb",
        backgroundColor: "#f9fafb",
    },
    modalButton: {
        flex: 1,
        padding: 14,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
    },
    modalButtonCancel: {
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#d1d5db",
    },
    modalButtonTextCancel: {
        color: "#6b7280",
        fontSize: 15,
        fontWeight: "600",
    },
    modalButtonApprove: {
        backgroundColor: "#16a34a",
    },
    modalButtonReject: {
        backgroundColor: "#dc2626",
    },
    modalButtonDisabled: {
        backgroundColor: "#d1d5db",
        borderColor: "#d1d5db",
    },
    modalButtonTextAction: {
        color: "#fff",
        fontSize: 15,
        fontWeight: "600",
    },
    filesBadge: {
        marginLeft: 8,
        paddingHorizontal: 8,
        paddingVertical: 2,
        backgroundColor: "rgba(255, 255, 255, 0.3)",
        borderRadius: 12,
    },
    filesBadgeText: {
        color: "#fff",
        fontSize: 11,
        fontWeight: "600",
    },

    // Success Notification
    successNotification: {
        position: "absolute",
        top: 40,
        right: 16,
        left: 16,
        zIndex: 9999,
    },
    successCard: {
        backgroundColor: "#fff",
        padding: 20,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#86efac",
        alignItems: "center",
        shadowColor: "#000",
        shadowOpacity: 0.15,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 8,
    },
    successTitle: {
        fontSize: 18,
        fontWeight: "bold",
        color: "#15803d",
        marginTop: 8,
    },
    successMessage: {
        fontSize: 14,
        color: "#166534",
        marginTop: 4,
        textAlign: "center",
    },
});