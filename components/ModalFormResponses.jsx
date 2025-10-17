import React, { useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Modal,
    TextInput,
    ActivityIndicator,
    Dimensions,
    Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialIcons } from "@expo/vector-icons";
import ApproversDetailModal from "./ApproversDetailModal";
const { width, height } = Dimensions.get("window");
const BACKEND_URL_KEY = "backend_url";

const getBackendUrl = async () => {
    const stored = await AsyncStorage.getItem(BACKEND_URL_KEY);
    return stored || "";
};

export default function ModalFormResponses({
    type,
    forms,
    onClose,
    onDownloadFile,
    onFormsUpdate,
}) {
    const [visibleResponses, setVisibleResponses] = useState({});
    const [showReconsiderModal, setShowReconsiderModal] = useState({});
    const [reconsiderMessage, setReconsiderMessage] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showApproversModal, setShowApproversModal] = useState(false);
    const [selectedFormForApprovers, setSelectedFormForApprovers] = useState(null);

    const toggleResponses = (id) => {
        setVisibleResponses((prev) => ({
            ...prev,
            [id]: !prev[id],
        }));
    };

    const toggleReconsiderModal = (id, value) => {
        setShowReconsiderModal((prev) => ({
            ...prev,
            [id]: value,
        }));

        if (value && !reconsiderMessage[id]) {
            setReconsiderMessage((prev) => ({
                ...prev,
                [id]: "He reconsiderado estas respuestas y acepto la aprobación.",
            }));
        }
    };

    const handleMessageChange = (id, message) => {
        setReconsiderMessage((prev) => ({
            ...prev,
            [id]: message,
        }));
    };

    const handleOpenApproversModal = (form) => {
        setSelectedFormForApprovers(form);
        setShowApproversModal(true);
    };

    const handleCloseApproversModal = () => {
        setShowApproversModal(false);
        setSelectedFormForApprovers(null);
    };

    const handleSubmitReconsideration = async (responseId, sequenceNumber) => {
        if (isSubmitting) return;

        setIsSubmitting(true);
        const token = await AsyncStorage.getItem("authToken");

        try {
            const backendUrl = await getBackendUrl();
            const response = await fetch(
                `${backendUrl}/approvers/update-response-approval/${responseId}`,
                {
                    method: "PUT",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        status: "aprobado",
                        message:
                            reconsiderMessage[responseId] ||
                            "He reconsiderado estas respuestas y acepto la aprobación del formulario.",
                        selectedSequence: sequenceNumber,
                    }),
                }
            );

            if (!response.ok) throw new Error("Error al actualizar");

            toggleReconsiderModal(responseId, false);

            try {
                const updatedResponse = await fetch(
                    `${backendUrl}/forms/user/assigned-forms-with-responses`,
                    {
                        headers: { Authorization: `Bearer ${token}` },
                    }
                );

                const updatedData = await updatedResponse.json();
                const counts = {};
                updatedData.forEach((item) => {
                    if (item?.your_approval_status?.status === "pendiente") {
                        const key = `${item.form_id}-${item.submitted_by?.user_id}`;
                        counts[key] = (counts[key] || 0) + 1;
                    }
                });

                if (onFormsUpdate) {
                    onFormsUpdate(updatedData, counts);
                }

                Alert.alert("Éxito", "Formulario aprobado correctamente");
                setTimeout(() => {
                    onClose();
                }, 500);
            } catch (error) {
                console.error("Error actualizando datos:", error);
                setTimeout(() => {
                    onClose();
                }, 500);
            }
        } catch (error) {
            console.error("Error:", error);
            Alert.alert("Error", "No se pudo completar la acción");
            setIsSubmitting(false);
        }
    };

    const handleRejectReconsideration = async (responseId) => {
        if (isSubmitting) return;

        setIsSubmitting(true);
        const token = await AsyncStorage.getItem("authToken");

        try {
            const backendUrl = await getBackendUrl();
            const response = await fetch(
                `${backendUrl}/responses/approvals/${responseId}/reset-reconsideration`,
                {
                    method: "PUT",
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            if (!response.ok) throw new Error("Error al rechazar");

            toggleReconsiderModal(responseId, false);

            try {
                const updatedResponse = await fetch(
                    `${backendUrl}/forms/user/assigned-forms-with-responses`,
                    {
                        headers: { Authorization: `Bearer ${token}` },
                    }
                );

                const updatedData = await updatedResponse.json();
                const counts = {};
                updatedData.forEach((item) => {
                    if (item?.your_approval_status?.status === "pendiente") {
                        const key = `${item.form_id}-${item.submitted_by?.user_id}`;
                        counts[key] = (counts[key] || 0) + 1;
                    }
                });

                if (onFormsUpdate) {
                    onFormsUpdate(updatedData, counts);
                }

                Alert.alert("Éxito", "Reconsideración rechazada");
                setTimeout(() => {
                    onClose();
                }, 500);
            } catch (error) {
                console.error("Error actualizando datos:", error);
                setTimeout(() => {
                    onClose();
                }, 500);
            }
        } catch (error) {
            console.error("Error:", error);
            Alert.alert("Error", "No se pudo completar la acción");
            setIsSubmitting(false);
        }
    };

    const title = type === "approved" ? "Formatos Aprobados" : "Formatos Rechazados";
    const headerBg = type === "approved" ? "#dcfce7" : "#fee2e2";
    const headerText = type === "approved" ? "#15803d" : "#b91c1c";
    const borderColor = type === "approved" ? "#86efac" : "#fca5a5";

    return (
        <Modal visible={true} transparent={true} animationType="slide">
            <View style={styles.container}>
                {/* Header */}
                <View style={[styles.header, { backgroundColor: headerBg }]}>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.title, { color: headerText }]}>
                            {title}
                        </Text>
                        <Text style={styles.subtitle}>
                            {forms.length}{" "}
                            {forms.length === 1 ? "formulario" : "formularios"}
                            {type === "approved" ? " aprobado" : " rechazado"}
                            {forms.length !== 1 ? "s" : ""}
                        </Text>
                    </View>
                    <TouchableOpacity
                        onPress={onClose}
                        style={styles.closeButton}
                    >
                        <MaterialIcons
                            name="close"
                            size={24}
                            color="#666"
                        />
                    </TouchableOpacity>
                </View>

                {/* Content */}
                <ScrollView
                    style={styles.content}
                    contentContainerStyle={styles.contentContainer}
                >
                    {forms.length === 0 ? (
                        <View style={styles.emptyState}>
                            <MaterialIcons
                                name="description"
                                size={48}
                                color="#ccc"
                            />
                            <Text style={styles.emptyText}>
                                No hay formularios{" "}
                                {type === "approved" ? "aprobados" : "rechazados"}.
                            </Text>
                        </View>
                    ) : (
                        <View style={styles.formsList}>
                            {forms.map((form, formIndex) => {
                                const hasReconsideration =
                                    type === "rejected" &&
                                    form.all_approvers.some(
                                        (approver) =>
                                            approver.reconsideration_requested ===
                                            true
                                    );

                                return (
                                    <View
                                        key={`form-${type}-${form.response_id}-${form.submitted_by?.user_id}-${formIndex}`}
                                        style={[
                                            styles.formCard,
                                            { borderColor },
                                        ]}
                                    >
                                        <View style={styles.cardContent}>
                                            <View style={styles.formHeader}>
                                                <Text
                                                    style={styles.formTitle}
                                                    numberOfLines={2}
                                                >
                                                    {form.form_title}
                                                </Text>
                                                {hasReconsideration && (
                                                    <View
                                                        style={
                                                            styles.reconsiderationBadge
                                                        }
                                                    >
                                                        <Text
                                                            style={
                                                                styles.reconsiderationText
                                                            }
                                                        >
                                                            Reconsideración
                                                        </Text>
                                                    </View>
                                                )}
                                            </View>

                                            <View style={styles.formInfo}>
                                                <View style={styles.infoRow}>
                                                    <MaterialIcons
                                                        name="person"
                                                        size={16}
                                                        color="#666"
                                                    />
                                                    <Text
                                                        style={styles.infoText}
                                                    >
                                                        {form.submitted_by.name}
                                                    </Text>
                                                </View>
                                                <View style={styles.infoRow}>
                                                    <MaterialIcons
                                                        name="calendar-today"
                                                        size={16}
                                                        color="#666"
                                                    />
                                                    <Text
                                                        style={styles.infoText}
                                                    >
                                                        {new Date(
                                                            form.submitted_at
                                                        ).toLocaleDateString(
                                                            "es-ES"
                                                        )}
                                                    </Text>
                                                </View>
                                                {form.reviewed_at && (
                                                    <View style={styles.infoRow}>
                                                        <MaterialIcons
                                                            name="check-circle"
                                                            size={16}
                                                            color="#666"
                                                        />
                                                        <Text
                                                            style={
                                                                styles.infoText
                                                            }
                                                        >
                                                            {new Date(
                                                                form.reviewed_at
                                                            ).toLocaleDateString(
                                                                "es-ES"
                                                            )}
                                                        </Text>
                                                    </View>
                                                )}
                                            </View>

                                            {/* Aprobadores */}
                                            <View style={styles.approversSection}>
                                                <View
                                                    style={
                                                        styles.approversHeader
                                                    }
                                                >
                                                    <Text
                                                        style={
                                                            styles.sectionTitle
                                                        }
                                                    >
                                                        Aprobadores
                                                    </Text>
                                                    <TouchableOpacity
                                                        onPress={() =>
                                                            handleOpenApproversModal(
                                                                form
                                                            )
                                                        }
                                                        style={
                                                            styles.detailsButton
                                                        }
                                                    >
                                                        <Text
                                                            style={
                                                                styles.detailsButtonText
                                                            }
                                                        >
                                                            Detalles
                                                        </Text>
                                                    </TouchableOpacity>
                                                </View>
                                                {form.all_approvers.map(
                                                    (approver, idx) => (
                                                        <TouchableOpacity
                                                            key={`approver-${form.response_id}-${approver.sequence_number}-${idx}`}
                                                            onPress={() =>
                                                                handleOpenApproversModal(
                                                                    form
                                                                )
                                                            }
                                                            style={
                                                                styles.approverRow
                                                            }
                                                        >
                                                            <View
                                                                style={
                                                                    styles.approverAvatar
                                                                }
                                                            >
                                                                <Text
                                                                    style={
                                                                        styles.approverAvatarText
                                                                    }
                                                                >
                                                                    {approver.user.name
                                                                        .charAt(0)
                                                                        .toUpperCase()}
                                                                </Text>
                                                            </View>
                                                            <View
                                                                style={{
                                                                    flex: 1,
                                                                }}
                                                            >
                                                                <Text
                                                                    style={
                                                                        styles.approverName
                                                                    }
                                                                >
                                                                    {
                                                                        approver
                                                                            .user
                                                                            .name
                                                                    }
                                                                </Text>
                                                                {approver.is_mandatory && (
                                                                    <Text
                                                                        style={
                                                                            styles.mandatoryText
                                                                        }
                                                                    >
                                                                        Obligatorio
                                                                    </Text>
                                                                )}
                                                            </View>
                                                            <View
                                                                style={
                                                                    styles.approverStatusContainer
                                                                }
                                                            >
                                                                {approver.reconsideration_requested && (
                                                                    <View
                                                                        style={
                                                                            styles.reconsiderationSmallBadge
                                                                        }
                                                                    >
                                                                        <Text
                                                                            style={
                                                                                styles.reconsiderationSmallText
                                                                            }
                                                                        >
                                                                            Reconsid.
                                                                        </Text>
                                                                    </View>
                                                                )}
                                                                <View
                                                                    style={[
                                                                        styles.statusBadge,
                                                                        {
                                                                            backgroundColor:
                                                                                approver.status ===
                                                                                "aprobado"
                                                                                        ? "#dcfce7"
                                                                                        : approver.status ===
                                                                                      "rechazado"
                                                                                    ? "#fee2e2"
                                                                                    : "#fef3c7",
                                                                        },
                                                                    ]}
                                                                >
                                                                    <Text
                                                                        style={[
                                                                            styles.statusText,
                                                                            {
                                                                                color:
                                                                                    approver.status ===
                                                                                    "aprobado"
                                                                                        ? "#15803d"
                                                                                        : approver.status ===
                                                                                          "rechazado"
                                                                                        ? "#b91c1c"
                                                                                        : "#ca8a04",
                                                                            },
                                                                        ]}
                                                                    >
                                                                        {approver.status ===
                                                                        "aprobado"
                                                                            ? "Aprobado"
                                                                            : approver.status ===
                                                                              "rechazado"
                                                                            ? "Rechazado"
                                                                            : "Pendiente"}
                                                                    </Text>
                                                                </View>
                                                            </View>
                                                        </TouchableOpacity>
                                                    )
                                                )}
                                            </View>
                                        </View>

                                        {/* Botones */}
                                        <View style={styles.buttonsContainer}>
                                            {hasReconsideration && (
                                                <TouchableOpacity
                                                    onPress={() =>
                                                        toggleReconsiderModal(
                                                            form.response_id,
                                                            true
                                                        )
                                                    }
                                                    disabled={isSubmitting}
                                                    style={
                                                        styles.reconsiderButton
                                                    }
                                                >
                                                    <MaterialIcons
                                                        name="check-circle"
                                                        size={18}
                                                        color="#fff"
                                                    />
                                                    <Text
                                                        style={
                                                            styles.reconsiderButtonText
                                                        }
                                                    >
                                                        {isSubmitting
                                                            ? "Procesando..."
                                                            : "Ver Reconsideración"}
                                                    </Text>
                                                </TouchableOpacity>
                                            )}

                                            <TouchableOpacity
                                                onPress={() =>
                                                    toggleResponses(
                                                        form.response_id
                                                    )
                                                }
                                                style={styles.responseButton}
                                            >
                                                <MaterialIcons
                                                    name={
                                                        visibleResponses[
                                                            form.response_id
                                                        ]
                                                            ? "expand-less"
                                                            : "expand-more"
                                                    }
                                                    size={18}
                                                    color="#2563eb"
                                                />
                                                <Text
                                                    style={
                                                        styles.responseButtonText
                                                    }
                                                >
                                                    {visibleResponses[
                                                        form.response_id
                                                    ]
                                                        ? "Ocultar"
                                                        : "Ver"}{" "}
                                                    Respuestas
                                                </Text>
                                            </TouchableOpacity>
                                        </View>

                                        {/* Respuestas */}
                                        {visibleResponses[form.response_id] && (
                                            <View
                                                style={styles.responsesSection}
                                            >
                                                <Text
                                                    style={
                                                        styles.responsesTitle
                                                    }
                                                >
                                                    Respuestas del Formulario
                                                </Text>
                                                {form.answers.length === 0 ? (
                                                    <View
                                                        style={
                                                            styles.emptyResponses
                                                        }
                                                    >
                                                        <Text
                                                            style={
                                                                styles.emptyResponsesText
                                                            }
                                                        >
                                                            No hay respuestas
                                                            registradas
                                                        </Text>
                                                    </View>
                                                ) : (
                                                    form.answers.map(
                                                        (answer, idx) => (
                                                            <View
                                                            
                                                                key={`answer-${form.response_id}-${answer.question_id}-${idx}-${formIndex}`}
                                                                style={
                                                                    styles.answerCard
                                                                }
                                                            >
                                                                <View
                                                                    style={
                                                                        styles.answerHeader
                                                                    }
                                                                >
                                                                    <Text
                                                                        style={
                                                                            styles.answerQuestion
                                                                        }
                                                                        numberOfLines={
                                                                            2
                                                                        }
                                                                    >
                                                                        {
                                                                            answer.question_text
                                                                        }
                                                                    </Text>
                                                                    <View
                                                                        style={
                                                                            styles.answerTypeBadge
                                                                        }
                                                                    >
                                                                        <Text
                                                                            style={
                                                                                styles.answerTypeText
                                                                            }
                                                                        >
                                                                            {answer.question_type ===
                                                                            "file"
                                                                                ? "Archivo"
                                                                                : answer.question_type ===
                                                                                  "firm"
                                                                                ? "Firma"
                                                                                : answer.question_type ===
                                                                                  "location"
                                                                                ? "Ubicación"
                                                                                : "Texto"}
                                                                        </Text>
                                                                    </View>
                                                                </View>

                                                                {answer.question_type ===
                                                                "file" &&
                                                                answer.file_path ? (
                                                                    <TouchableOpacity
                                                                        onPress={() =>
                                                                            onDownloadFile(
                                                                                answer.file_path
                                                                            )
                                                                        }
                                                                        style={
                                                                            styles.downloadButton
                                                                        }
                                                                    >
                                                                        <MaterialIcons
                                                                            name="download"
                                                                            size={
                                                                                16
                                                                            }
                                                                            color="#fff"
                                                                        />
                                                                        <Text
                                                                            style={
                                                                                styles.downloadButtonText
                                                                            }
                                                                        >
                                                                            Descargar
                                                                        </Text>
                                                                    </TouchableOpacity>
                                                                ) : (
                                                                    <Text
                                                                        style={
                                                                            styles.answerText
                                                                        }
                                                                    >
                                                                        {answer.answer_text ||
                                                                            "Sin respuesta"}
                                                                    </Text>
                                                                )}
                                                            </View>
                                                        )
                                                    )
                                                )}
                                            </View>
                                        )}
                                    </View>
                                );
                            })}
                        </View>
                    )}
                </ScrollView>

                {/* Reconsider Modal */}
                {Object.keys(showReconsiderModal).map((formId, modalIndex) => {
                    if (!showReconsiderModal[formId]) return null;
                    const form = forms.find(
                        (f) => String(f.response_id) === formId
                    );
                    if (!form) return null;

                    return (
                        <Modal
                            key={`reconsider-modal-${type}-${formId}-${modalIndex}`}
                            visible={true}
                            transparent={true}
                            animationType="fade"
                        >
                            <View style={styles.modalOverlay}>
                                <View style={styles.modalContent}>
                                    <View style={styles.modalHeader}>
                                        <View style={styles.modalIconContainer}>
                                            <MaterialIcons
                                                name="description"
                                                size={28}
                                                color="#1f2937"
                                            />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text
                                                style={styles.modalTitle}
                                            >
                                                Gestión de Reconsideración
                                            </Text>
                                            <Text
                                                style={styles.modalSubtitle}
                                            >
                                                Revisión de solicitud
                                            </Text>
                                        </View>
                                        <TouchableOpacity
                                            onPress={() =>
                                                toggleReconsiderModal(
                                                    formId,
                                                    false
                                                )
                                            }
                                            disabled={isSubmitting}
                                        >
                                            <MaterialIcons
                                                name="close"
                                                size={24}
                                                color="#666"
                                            />
                                        </TouchableOpacity>
                                    </View>

                                    <ScrollView
                                        style={styles.modalBody}
                                        nestedScrollEnabled
                                    >
                                        <View
                                            style={styles.modalWarningBox}
                                        >
                                            <MaterialIcons
                                                name="info"
                                                size={20}
                                                color="#2563eb"
                                            />
                                            <View style={{ flex: 1 }}>
                                                <Text
                                                    style={
                                                        styles.modalWarningTitle
                                                    }
                                                >
                                                    Solicitud Pendiente
                                                </Text>
                                                <Text
                                                    style={
                                                        styles.modalWarningText
                                                    }
                                                >
                                                    Se ha solicitado revisar la
                                                    decisión. Puede aprobar o
                                                    rechazar definitivamente.
                                                </Text>
                                            </View>
                                        </View>

                                        <View style={styles.modalFormGroup}>
                                            <Text
                                                style={
                                                    styles.modalFormLabel
                                                }
                                            >
                                                Comentarios
                                            </Text>
                                            <TextInput
                                                style={
                                                    styles.modalTextInput
                                                }
                                                value={
                                                    reconsiderMessage[formId] ||
                                                    ""
                                                }
                                                onChangeText={(msg) =>
                                                    handleMessageChange(
                                                        formId,
                                                        msg
                                                    )
                                                }
                                                placeholder="Ingrese comentarios..."
                                                multiline
                                                numberOfLines={4}
                                                maxLength={500}
                                            />
                                            <Text
                                                style={
                                                    styles.modalFormHint
                                                }
                                            >
                                                {(
                                                    reconsiderMessage[formId] ||
                                                    ""
                                                ).length || 0}
                                                /500
                                            </Text>
                                        </View>
                                    </ScrollView>

                                    <View style={styles.modalFooter}>
                                        <TouchableOpacity
                                            onPress={() =>
                                                handleRejectReconsideration(
                                                    formId
                                                )
                                            }
                                            disabled={isSubmitting}
                                            style={
                                                styles.modalButtonReject
                                            }
                                        >
                                            {isSubmitting ? (
                                                <ActivityIndicator
                                                    color="#666"
                                                />
                                            ) : (
                                                <>
                                                    <MaterialIcons
                                                        name="close"
                                                        size={18}
                                                        color="#666"
                                                    />
                                                    <Text
                                                        style={
                                                            styles.modalButtonRejectText
                                                        }
                                                    >
                                                        Rechazar
                                                    </Text>
                                                </>
                                            )}
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            onPress={() =>
                                                handleSubmitReconsideration(
                                                    formId,
                                                    form.your_approval_status
                                                        .sequence_number
                                                )
                                            }
                                            disabled={
                                                isSubmitting ||
                                                !(
                                                    reconsiderMessage[formId] &&
                                                    reconsiderMessage[formId]
                                                        .trim()
                                                )
                                            }
                                            style={
                                                styles.modalButtonApprove
                                            }
                                        >
                                            {isSubmitting ? (
                                                <ActivityIndicator
                                                    color="#fff"
                                                />
                                            ) : (
                                                <>
                                                    <MaterialIcons
                                                        name="check"
                                                        size={18}
                                                        color="#fff"
                                                    />
                                                    <Text
                                                        style={
                                                            styles.modalButtonApproveText
                                                        }
                                                    >
                                                        Aprobar
                                                    </Text>
                                                </>
                                            )}
                                        </TouchableOpacity>
                                    </View>

                                    <TouchableOpacity
                                        onPress={() =>
                                            toggleReconsiderModal(formId, false)
                                        }
                                        disabled={isSubmitting}
                                        style={styles.modalButtonCancel}
                                    >
                                        <Text
                                            style={
                                                styles.modalButtonCancelText
                                            }
                                        >
                                            Cancelar
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </Modal>
                    );
                })}

                {/* Approvers Detail Modal */}
                {selectedFormForApprovers && (
                    <ApproversDetailModal
                        isVisible={showApproversModal}
                        onClose={handleCloseApproversModal}
                        responseId={selectedFormForApprovers.response_id}
                        formTitle={selectedFormForApprovers.form_title}
                    />
                )}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#fff",
    },
    header: {
        flexDirection: "row",
        padding: 16,
        alignItems: "center",
        justifyContent: "space-between",
        borderBottomWidth: 1,
        borderBottomColor: "#e5e7eb",
    },
    title: {
        fontSize: 20,
        fontWeight: "bold",
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 12,
        color: "#666",
    },
    closeButton: {
        padding: 8,
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        padding: 16,
    },
    emptyState: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 40,
    },
    emptyText: {
        marginTop: 12,
        fontSize: 16,
        color: "#999",
        textAlign: "center",
    },
    formsList: {
        gap: 16,
    },
    formCard: {
        backgroundColor: "#fff",
        borderWidth: 2,
        borderRadius: 12,
        overflow: "hidden",
        elevation: 3,
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
    },
    cardContent: {
        padding: 16,
    },
    formHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12,
    },
    formTitle: {
        fontSize: 16,
        fontWeight: "bold",
        color: "#1f2937",
        flex: 1,
    },
    reconsiderationBadge: {
        backgroundColor: "#fef3c7",
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: "#fde68a",
    },
    reconsiderationText: {
        color: "#92400e",
        fontSize: 11,
        fontWeight: "600",
    },
    formInfo: {
        gap: 8,
        marginBottom: 12,
    },
    infoRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    infoText: {
        fontSize: 13,
        color: "#4b5563",
    },
    approversSection: {
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: "#e5e7eb",
    },
    approversHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: "bold",
        color: "#1f2937",
    },
    detailsButton: {
        backgroundColor: "#2563eb",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
    },
    detailsButtonText: {
        color: "#fff",
        fontSize: 11,
        fontWeight: "600",
    },
    approverRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        paddingHorizontal: 8,
        backgroundColor: "#f9fafb",
        borderRadius: 8,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: "#e5e7eb",
    },
    approverAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: "#d1d5db",
        justifyContent: "center",
        alignItems: "center",
        marginRight: 8,
    },
    approverAvatarText: {
        color: "#666",
        fontWeight: "bold",
        fontSize: 12,
    },
    approverName: {
        fontSize: 13,
        fontWeight: "600",
        color: "#1f2937",
    },
    mandatoryText: {
        fontSize: 10,
        color: "#2563eb",
        marginTop: 2,
    },
    approverStatusContainer: {
        flexDirection: "row",
        gap: 4,
        alignItems: "center",
    },
    reconsiderationSmallBadge: {
        backgroundColor: "#fed7aa",
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    reconsiderationSmallText: {
        fontSize: 9,
        color: "#ea580c",
        fontWeight: "600",
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    statusText: {
        fontSize: 11,
        fontWeight: "600",
    },
    buttonsContainer: {
        flexDirection: "row",
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: "#e5e7eb",
    },
    reconsiderButton: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#f59e0b",
        paddingVertical: 10,
        borderRadius: 8,
        gap: 6,
    },
    reconsiderButtonText: {
        color: "#fff",
        fontSize: 12,
        fontWeight: "600",
    },
    responseButton: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#fff",
        borderWidth: 2,
        borderColor: "#2563eb",
        paddingVertical: 10,
        borderRadius: 8,
        gap: 6,
    },
    responseButtonText: {
        color: "#2563eb",
        fontSize: 12,
        fontWeight: "600",
    },
    responsesSection: {
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: "#e5e7eb",
        backgroundColor: "#f9fafb",
    },
    responsesTitle: {
        fontSize: 14,
        fontWeight: "bold",
        color: "#1f2937",
        marginBottom: 12,
    },
    emptyResponses: {
        paddingVertical: 20,
        alignItems: "center",
    },
    emptyResponsesText: {
        fontSize: 13,
        color: "#999",
    },
    answerCard: {
        backgroundColor: "#fff",
        padding: 12,
        borderRadius: 8,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: "#e5e7eb",
    },
    answerHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 8,
        gap: 8,
    },
    answerQuestion: {
        fontSize: 13,
        fontWeight: "600",
        color: "#1f2937",
        flex: 1,
    },
    answerTypeBadge: {
        backgroundColor: "#dbeafe",
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 4,
    },
    answerTypeText: {
        fontSize: 10,
        color: "#2563eb",
        fontWeight: "600",
    },
    answerText: {
        fontSize: 13,
        color: "#4b5563",
        lineHeight: 20,
    },
    downloadButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#2563eb",
        paddingVertical: 8,
        borderRadius: 6,
        gap: 6,
    },
    downloadButtonText: {
        color: "#fff",
        fontSize: 12,
        fontWeight: "600",
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "flex-end",
    },
    modalContent: {
        backgroundColor: "#fff",
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        maxHeight: height * 0.85,
        paddingTop: 0,
    },
    modalHeader: {
        flexDirection: "row",
        alignItems: "center",
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#e5e7eb",
        gap: 12,
    },
    modalIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "#f3f4f6",
        justifyContent: "center",
        alignItems: "center",
    },
    modalTitle: {
        fontSize: 16,
        fontWeight: "bold",
        color: "#1f2937",
    },
    modalSubtitle: {
        fontSize: 12,
        color: "#666",
        marginTop: 2,
    },
    modalBody: {
        flex: 1,
        padding: 16,
    },
    modalWarningBox: {
        flexDirection: "row",
        backgroundColor: "#dbeafe",
        borderWidth: 1,
        borderColor: "#93c5fd",
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
        gap: 12,
    },
    modalWarningTitle: {
        fontSize: 13,
        fontWeight: "600",
        color: "#0c4a6e",
        marginBottom: 4,
    },
    modalWarningText: {
        fontSize: 12,
        color: "#0369a1",
        lineHeight: 18,
    },
    modalFormGroup: {
        marginBottom: 16,
    },
    modalFormLabel: {
        fontSize: 13,
        fontWeight: "600",
        color: "#1f2937",
        marginBottom: 8,
    },
    modalTextInput: {
        borderWidth: 1,
        borderColor: "#d1d5db",
        borderRadius: 8,
        padding: 12,
        fontSize: 13,
        color: "#1f2937",
        minHeight: 100,
        textAlignVertical: "top",
    },
    modalFormHint: {
        fontSize: 11,
        color: "#999",
        marginTop: 4,
        textAlign: "right",
    },
    modalFooter: {
        flexDirection: "row",
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: "#e5e7eb",
    },
    modalButtonReject: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#d1d5db",
        paddingVertical: 10,
        borderRadius: 8,
        gap: 6,
    },
    modalButtonRejectText: {
        color: "#666",
        fontSize: 12,
        fontWeight: "600",
    },
    modalButtonApprove: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#16a34a",
        paddingVertical: 10,
        borderRadius: 8,
        gap: 6,
    },
    modalButtonApproveText: {
        color: "#fff",
        fontSize: 12,
        fontWeight: "600",
    },
    modalButtonCancel: {
        marginHorizontal: 16,
        paddingVertical: 10,
        paddingBottom: 16,
    },
    modalButtonCancelText: {
        color: "#666",
        fontSize: 13,
        fontWeight: "600",
        textAlign: "center",
    },
});