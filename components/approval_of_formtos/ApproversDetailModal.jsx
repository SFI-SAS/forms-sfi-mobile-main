import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Dimensions,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const { width, height } = Dimensions.get('window');
const BACKEND_URL_KEY = 'backend_url';
const APPROVERS_DETAIL_OFFLINE_KEY = 'approvers_detail_offline';

const getBackendUrl = async () => {
  return await AsyncStorage.getItem(BACKEND_URL_KEY) || '';
};

const ApproversDetailModal = ({ 
  isVisible, 
  onClose, 
  responseId, 
  formTitle 
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [approverDetails, setApproverDetails] = useState(null);
  
  const [selectedApproverId, setSelectedApproverId] = useState(null);
  const [requiredFormsData, setRequiredFormsData] = useState([]);
  const [loadingRequiredForms, setLoadingRequiredForms] = useState(false);
  const [viewingRequiredForm, setViewingRequiredForm] = useState(null);
  const [currentResponseIndex, setCurrentResponseIndex] = useState(0);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (isVisible && responseId) {
      checkConnectionAndFetch();
    }
  }, [isVisible, responseId]);

  const checkConnectionAndFetch = async () => {
    try {
      const net = await NetInfo.fetch();
      setIsOffline(!net.isConnected);
      
      if (net.isConnected) {
        await fetchApproverDetails();
      } else {
        await loadApproverDetailsOffline();
      }
    } catch (err) {
      console.error('Error checking connection:', err);
      await loadApproverDetailsOffline();
    }
  };

  const fetchApproverDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = await AsyncStorage.getItem('authToken');
      if (!token) throw new Error('No authentication token');

      const backendUrl = await getBackendUrl();
      if (!backendUrl) throw new Error('No backend URL configured');

      const response = await fetch(
        `${backendUrl}/approvers/response/${responseId}/approval-details`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) throw new Error(`API Error: ${response.status}`);

      const data = await response.json();
      setApproverDetails(data);
      await saveApproverDetailsOffline(data);
      
    } catch (err) {
      console.error('Error fetching:', err);
      setError(err.message);
      await loadApproverDetailsOffline();
    } finally {
      setLoading(false);
    }
  };

  const saveApproverDetailsOffline = async (data) => {
    try {
      const stored = await AsyncStorage.getItem(APPROVERS_DETAIL_OFFLINE_KEY);
      const cache = stored ? JSON.parse(stored) : {};
      cache[responseId] = data;
      await AsyncStorage.setItem(APPROVERS_DETAIL_OFFLINE_KEY, JSON.stringify(cache));
    } catch (e) {
      console.error('Error saving offline:', e);
    }
  };

  const loadApproverDetailsOffline = async () => {
    try {
      setLoading(true);
      const stored = await AsyncStorage.getItem(APPROVERS_DETAIL_OFFLINE_KEY);
      if (stored) {
        const cache = JSON.parse(stored);
        if (cache[responseId]) {
          setApproverDetails(cache[responseId]);
          setError(null);
          setLoading(false);
          return;
        }
      }
      setError('No data available');
      setLoading(false);
    } catch (e) {
      console.error('Error loading offline:', e);
      setError('Error loading data');
      setLoading(false);
    }
  };

  const fetchRequiredFormsForApprover = async (approverId) => {
    try {
      setLoadingRequiredForms(true);
      const token = await AsyncStorage.getItem('authToken');
      if (!token) throw new Error('No token');

      const backendUrl = await getBackendUrl();
      const response = await fetch(
        `${backendUrl}/approvers/response/${responseId}/approver/${approverId}/required-forms`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) throw new Error('Failed to fetch');

      const data = await response.json();
      setRequiredFormsData(data.required_forms || []);
    } catch (err) {
      console.error('Error:', err);
      Alert.alert('Error', 'Could not load required forms');
      setRequiredFormsData([]);
    } finally {
      setLoadingRequiredForms(false);
    }
  };

  const handleViewApproverRequirements = async (approverId) => {
    setSelectedApproverId(approverId);
    await fetchRequiredFormsForApprover(approverId);
  };

  const handleViewRequiredFormResponses = (requiredForm) => {
    setViewingRequiredForm(requiredForm);
    setCurrentResponseIndex(0);
  };

  const handleDownloadFile = (filePath) => {
    const fileName = filePath?.split('/')?.pop() || filePath;
    Alert.alert('Download', `File: ${fileName}\n\nDownload coming soon.`);
  };

  const goBackToApproversList = () => {
    setSelectedApproverId(null);
    setRequiredFormsData([]);
    setViewingRequiredForm(null);
    setCurrentResponseIndex(0);
  };

  const goBackToRequiredFormsList = () => {
    setViewingRequiredForm(null);
    setCurrentResponseIndex(0);
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'aprobado': return 'check-circle';
      case 'rechazado': return 'cancel';
      default: return 'schedule';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'aprobado': return '#16a34a';
      case 'rechazado': return '#dc2626';
      default: return '#6b7280';
    }
  };

  const getStatusBgColor = (status) => {
    switch (status) {
      case 'aprobado': return '#dcfce7';
      case 'rechazado': return '#fee2e2';
      default: return '#fef3c7';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'N/A';
    }
  };

  const TimelineNode = ({ approver, isLast }) => {
    if (!approver?.user) return null;

    return (
      <View style={styles.timelineNode}>
        {!isLast && (
          <View style={styles.timelineLineContainer}>
            <View style={[
              styles.timelineLine,
              { backgroundColor: approver.status === 'aprobado' ? '#86efac' : '#d1d5db' }
            ]} />
          </View>
        )}
        
        <View style={styles.timelineNodeContent}>
          <View style={[
            styles.statusIconContainer,
            { backgroundColor: getStatusColor(approver.status) }
          ]}>
            <MaterialIcons 
              name={getStatusIcon(approver.status)} 
              size={24} 
              color="#fff" 
            />
          </View>
          
          <View style={styles.approverCard}>
            <View style={styles.approverHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.approverName}>{approver.user.name}</Text>
                <Text style={styles.approverEmail}>{approver.user.email}</Text>
                <Text style={styles.sequenceText}>Seq #{approver.sequence_number}</Text>
              </View>
              
              <View style={styles.badgesContainer}>
                {approver.is_mandatory && (
                  <View style={styles.mandatoryBadge}>
                    <Text style={styles.mandatoryText}>Required</Text>
                  </View>
                )}
                <View style={[
                  styles.statusBadge,
                  { backgroundColor: getStatusBgColor(approver.status) }
                ]}>
                  <Text style={[
                    styles.statusBadgeText,
                    { color: getStatusColor(approver.status) }
                  ]}>
                    {approver.status}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.approverInfo}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Doc:</Text>
                <Text style={styles.infoValue}>{approver.user.num_document}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Date:</Text>
                <Text style={styles.infoValue}>{formatDate(approver.reviewed_at)}</Text>
              </View>
            </View>

            {approver.message && (
              <View style={styles.messageContainer}>
                <View style={styles.messageHeader}>
                  <MaterialIcons name="message" size={16} color="#6b7280" />
                  <Text style={styles.messageLabel}>Comment:</Text>
                </View>
                <View style={styles.messageBox}>
                  <Text style={styles.messageText}>{approver.message}</Text>
                </View>
              </View>
            )}

            {approver.attachment_files?.length > 0 && (
              <View style={styles.attachmentsContainer}>
                <View style={styles.attachmentsHeader}>
                  <MaterialIcons name="attach-file" size={16} color="#6b7280" />
                  <Text style={styles.attachmentsLabel}>Files:</Text>
                </View>
                <View style={styles.attachmentsList}>
                  {approver.attachment_files.map((file, idx) => (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => handleDownloadFile(file.stored_name || file.original_name)}
                      style={styles.attachmentItem}
                    >
                      <MaterialIcons name="insert-drive-file" size={20} color="#2563eb" />
                      <Text style={styles.attachmentName} numberOfLines={1}>
                        {file.original_name}
                      </Text>
                      <Text style={styles.attachmentSize}>
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {approver.reconsideration_requested && (
              <View style={styles.reconsiderationBadge}>
                <MaterialIcons name="refresh" size={16} color="#ea580c" />
                <Text style={styles.reconsiderationText}>Reconsidered</Text>
              </View>
            )}

            <View style={styles.requirementsButtonContainer}>
              <TouchableOpacity
                onPress={() => handleViewApproverRequirements(approver.user_id)}
                style={styles.requirementsButton}
              >
                <MaterialIcons name="assignment" size={18} color="#2563eb" />
                <Text style={styles.requirementsButtonText}>View Requirements</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  };

  if (!isVisible) return null;

  // View required form responses
  if (viewingRequiredForm?.approver_responses?.responses?.length > 0) {
    const currentResponse = viewingRequiredForm.approver_responses.responses[currentResponseIndex];
    if (!currentResponse) return null;

    return (
      <Modal visible={isVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={goBackToRequiredFormsList} style={styles.backButton}>
                <MaterialIcons name="chevron-left" size={24} color="#4B34C7" />
              </TouchableOpacity>
              
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  {viewingRequiredForm.required_form?.form_title || 'Form'}
                </Text>
                <Text style={styles.modalSubtitle}>
                  #{currentResponseIndex + 1} of {viewingRequiredForm.approver_responses.responses.length}
                </Text>
              </View>

              {viewingRequiredForm.approver_responses.responses.length > 1 && (
                <View style={styles.navigationContainer}>
                  <TouchableOpacity
                    onPress={() => setCurrentResponseIndex(Math.max(0, currentResponseIndex - 1))}
                    disabled={currentResponseIndex === 0}
                    style={[styles.navButton, currentResponseIndex === 0 && styles.navButtonDisabled]}
                  >
                    <MaterialIcons name="chevron-left" size={20} color={currentResponseIndex === 0 ? "#9ca3af" : "#4B34C7"} />
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    onPress={() => setCurrentResponseIndex(Math.min(viewingRequiredForm.approver_responses.responses.length - 1, currentResponseIndex + 1))}
                    disabled={currentResponseIndex === viewingRequiredForm.approver_responses.responses.length - 1}
                    style={[styles.navButton, currentResponseIndex === viewingRequiredForm.approver_responses.responses.length - 1 && styles.navButtonDisabled]}
                  >
                    <MaterialIcons name="chevron-right" size={20} color={currentResponseIndex === viewingRequiredForm.approver_responses.responses.length - 1 ? "#9ca3af" : "#4B34C7"} />
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <MaterialIcons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalContent}>
              <View style={styles.responseInfoCard}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Submitted by:</Text>
                  <Text style={styles.infoValue}>{currentResponse.submitted_by?.name || 'N/A'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Date:</Text>
                  <Text style={styles.infoValue}>{formatDate(currentResponse.submitted_at)}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Status:</Text>
                  <View style={[
                    styles.fulfillmentBadge,
                    { backgroundColor: currentResponse.fulfills_requirement ? '#dcfce7' : '#f3f4f6' }
                  ]}>
                    <Text style={[
                      styles.fulfillmentText,
                      { color: currentResponse.fulfills_requirement ? '#15803d' : '#6b7280' }
                    ]}>
                      {currentResponse.fulfills_requirement ? 'Meets' : 'Does not meet'}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.answersSection}>
                <Text style={styles.sectionTitle}>Responses</Text>
                {currentResponse.answers?.length > 0 ? (
                  <View style={styles.answersList}>
                    {currentResponse.answers.map((answer, idx) => (
                      <View key={idx} style={styles.answerCard}>
                        <Text style={styles.questionText}>{answer.question_text}</Text>
                        {answer.question_type === "file" && answer.file_path ? (
                          <TouchableOpacity onPress={() => handleDownloadFile(answer.file_path)} style={styles.fileButton}>
                            <MaterialIcons name="attach-file" size={18} color="#2563eb" />
                            <Text style={styles.fileButtonText}>Download</Text>
                          </TouchableOpacity>
                        ) : (
                          <Text style={styles.answerText}>{answer.answer_text || "No answer"}</Text>
                        )}
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.emptyAnswers}>
                    <MaterialIcons name="description" size={48} color="#9ca3af" />
                    <Text style={styles.emptyText}>No responses</Text>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  }

  // View required forms for approver
  if (selectedApproverId) {
    const selectedApprover = approverDetails?.all_approvers?.find(a => a.user_id === selectedApproverId);
    
    return (
      <Modal visible={isVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={goBackToApproversList} style={styles.backButton}>
                <MaterialIcons name="chevron-left" size={24} color="#4B34C7" />
              </TouchableOpacity>
              
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.modalTitle}>Required Forms</Text>
                <Text style={styles.modalSubtitle}>{selectedApprover?.user?.name || 'Approver'}</Text>
              </View>

              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <MaterialIcons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalContent}>
              {loadingRequiredForms ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#2563eb" />
                  <Text style={styles.loadingText}>Loading...</Text>
                </View>
              ) : requiredFormsData.length === 0 ? (
                <View style={styles.emptyState}>
                  <MaterialIcons name="assignment" size={64} color="#9ca3af" />
                  <Text style={styles.emptyTitle}>No required forms</Text>
                </View>
              ) : (
                <View style={styles.requiredFormsList}>
                  {requiredFormsData.map((req) => (
                    <View key={req.requirement_id} style={styles.requiredFormCard}>
                      <View style={styles.requiredFormHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.requiredFormTitle}>{req.required_form?.form_title || 'Form'}</Text>
                          <Text style={styles.requiredFormDescription}>{req.required_form?.form_description || ''}</Text>
                        </View>
                        
                        <View style={[
                          styles.fulfillmentStatusBadge,
                          { backgroundColor: req.fulfillment_status?.is_fulfilled ? '#dcfce7' : '#fee2e2' }
                        ]}>
                          <Text style={[
                            styles.fulfillmentStatusText,
                            { color: req.fulfillment_status?.is_fulfilled ? '#15803d' : '#b91c1c' }
                          ]}>
                            {req.fulfillment_status?.is_fulfilled ? 'Done' : 'Pending'}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.requiredFormInfo}>
                        <View style={styles.infoRow}>
                          <Text style={styles.infoLabel}>Responses:</Text>
                          <Text style={styles.infoValue}>{req.approver_responses?.total_responses || 0}</Text>
                        </View>
                      </View>

                      {req.approver_responses?.has_responses && (
                        <TouchableOpacity
                          onPress={() => handleViewRequiredFormResponses(req)}
                          style={styles.viewResponsesButton}
                        >
                          <MaterialIcons name="visibility" size={18} color="#fff" />
                          <Text style={styles.viewResponsesButtonText}>View ({req.approver_responses.total_responses})</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  }

  // Main view
  return (
    <Modal visible={isVisible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View style={styles.iconContainer}>
              <MaterialIcons name="people" size={24} color="#2563eb" />
            </View>
            
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.modalTitle}>Approval Details</Text>
              <Text style={styles.modalSubtitle} numberOfLines={1}>{formTitle}</Text>
            </View>

            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialIcons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#2563eb" />
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <MaterialIcons name="error" size={48} color="#ef4444" />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={checkConnectionAndFetch} style={styles.retryButton}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : approverDetails?.all_approvers ? (
            <ScrollView style={styles.modalContent}>
              <View style={styles.basicInfoCard}>
                <View style={styles.infoItem}>
                  <MaterialIcons name="tag" size={20} color="#6b7280" />
                  <View style={{ marginLeft: 8 }}>
                    <Text style={styles.infoLabel}>Response ID</Text>
                    <Text style={styles.infoValue}>#{approverDetails.response_id}</Text>
                  </View>
                </View>
                
                <View style={styles.infoItem}>
                  <MaterialIcons name="person" size={20} color="#6b7280" />
                  <View style={{ marginLeft: 8 }}>
                    <Text style={styles.infoLabel}>Submitted by</Text>
                    <Text style={styles.infoValue}>{approverDetails.submitted_by?.name || 'N/A'}</Text>
                  </View>
                </View>
                
                <View style={styles.infoItem}>
                  <MaterialIcons name="calendar-today" size={20} color="#6b7280" />
                  <View style={{ marginLeft: 8 }}>
                    <Text style={styles.infoLabel}>Date</Text>
                    <Text style={styles.infoValue}>{formatDate(approverDetails.submitted_at)}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.timelineSection}>
                <Text style={styles.sectionTitle}>Approval Chain</Text>
                
                <View style={styles.timeline}>
                  {approverDetails.all_approvers
                    .sort((a, b) => a.sequence_number - b.sequence_number)
                    .map((approver, idx) => (
                      <TimelineNode
                        key={`${approver.user_id}-${approver.sequence_number}`}
                        approver={approver}
                        isLast={idx === approverDetails.all_approvers.length - 1}
                      />
                    ))
                  }
                </View>
              </View>

              {approverDetails.approval_requirements?.has_requirements && (
                <View style={styles.requirementsSection}>
                  <Text style={styles.sectionTitle}>Requirements</Text>
                  
                  <View style={styles.requirementsProgress}>
                    <View style={styles.progressInfo}>
                      <Text style={styles.progressTitle}>
                        {approverDetails.approval_requirements.fulfilled_requirements} of {approverDetails.approval_requirements.total_requirements}
                      </Text>
                      <Text style={styles.progressSubtitle}>
                        {approverDetails.approval_requirements.pending_requirements} pending
                      </Text>
                    </View>
                    <Text style={styles.progressPercentage}>
                      {approverDetails.approval_requirements.completion_percentage}%
                    </Text>
                  </View>

                  {approverDetails.approval_requirements.requirements?.length > 0 ? (
                    <View style={styles.requirementsList}>
                      {approverDetails.approval_requirements.requirements.map((req, idx) => (
                        <View key={idx} style={styles.requirementItem}>
                          <View style={styles.requirementHeader}>
                            <Text style={styles.requirementTitle}>
                              {req.required_form?.form_title || 'Form'}
                            </Text>
                            <View style={[
                              styles.requirementStatusBadge,
                              { backgroundColor: req.fulfillment_status?.is_fulfilled ? '#dcfce7' : '#fee2e2' }
                            ]}>
                              <Text style={[
                                styles.requirementStatusText,
                                { color: req.fulfillment_status?.is_fulfilled ? '#15803d' : '#b91c1c' }
                              ]}>
                                {req.fulfillment_status?.is_fulfilled ? 'Done' : 'Pending'}
                              </Text>
                            </View>
                          </View>
                          
                          <Text style={styles.requirementDescription}>
                            {req.required_form?.form_description || ''}
                          </Text>
                          
                          <Text style={styles.requirementResponsible}>
                            By: {req.approver?.name || 'N/A'} ({req.approver?.email || 'N/A'})
                          </Text>
                          
                          {req.fulfillment_status?.is_fulfilled && req.fulfillment_status?.fulfilling_response_submitted_at && (
                            <View style={styles.requirementCompletedInfo}>
                              <Text style={styles.requirementCompletedText}>
                                Done {formatDate(req.fulfillment_status.fulfilling_response_submitted_at)}
                              </Text>
                            </View>
                          )}
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              )}

              {isOffline && (
                <View style={styles.offlineWarning}>
                  <MaterialIcons name="cloud-off" size={20} color="#ea580c" />
                  <Text style={styles.offlineWarningText}>Offline mode</Text>
                </View>
              )}
            </ScrollView>
          ) : (
            <View style={styles.loadingContainer}>
              <MaterialIcons name="warning" size={48} color="#f59e0b" />
              <Text style={styles.loadingText}>No data</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: width * 0.95,
    height: height * 0.85,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  backButton: { padding: 8 },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#dbeafe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: { padding: 8 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1f2937' },
  modalSubtitle: { fontSize: 14, color: '#6b7280', marginTop: 2 },
  navigationContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 8 },
  navButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  navButtonDisabled: { backgroundColor: '#f3f4f6' },
  modalContent: { flex: 1, padding: 16 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  loadingText: { marginTop: 12, fontSize: 16, color: '#6b7280' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  errorText: { marginTop: 12, fontSize: 16, color: '#ef4444', textAlign: 'center', paddingHorizontal: 20 },
  retryButton: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#2563eb', borderRadius: 8 },
  retryButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  basicInfoCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16, marginBottom: 20 },
  infoItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  infoLabel: { fontSize: 12, color: '#6b7280' },
  infoValue: { fontSize: 14, fontWeight: '600', color: '#1f2937', marginTop: 2 },
  timelineSection: { marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1f2937', marginBottom: 16 },
  timeline: { paddingLeft: 0 },
  timelineNode: { position: 'relative', marginBottom: 0 },
  timelineLineContainer: { position: 'absolute', left: 20, top: 40, bottom: 0, width: 2, zIndex: 0 },
  timelineLine: { flex: 1, width: 2 },
  timelineNodeContent: { flexDirection: 'row', alignItems: 'flex-start', zIndex: 10, marginBottom: 16 },
  statusIconContainer: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#fff', marginRight: 12 },
  approverCard: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16 },
  approverHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  approverName: { fontSize: 16, fontWeight: '600', color: '#1f2937' },
  approverEmail: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  sequenceText: { fontSize: 11, color: '#9ca3af', marginTop: 4 },
  badgesContainer: { flexDirection: 'column', alignItems: 'flex-end', gap: 4 },
  mandatoryBadge: { paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#f3f4f6', borderRadius: 6 },
  mandatoryText: { fontSize: 11, fontWeight: '600', color: '#6b7280' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusBadgeText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  approverInfo: { marginBottom: 12 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap' },
  messageContainer: { marginBottom: 12 },
  messageHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 },
  messageLabel: { fontSize: 13, fontWeight: '600', color: '#4b5563' },
  messageBox: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 12 },
  messageText: { fontSize: 13, color: '#1f2937', lineHeight: 20 },
  attachmentsContainer: { marginBottom: 12 },
  attachmentsHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 },
  attachmentsLabel: { fontSize: 13, fontWeight: '600', color: '#4b5563' },
  attachmentsList: { gap: 8 },
  attachmentItem: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, gap: 8 },
  attachmentName: { flex: 1, fontSize: 13, color: '#1f2937' },
  attachmentSize: { fontSize: 11, color: '#6b7280' },
  reconsiderationBadge: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#fed7aa', borderRadius: 8, marginBottom: 12, gap: 8 },
  reconsiderationText: { fontSize: 13, fontWeight: '600', color: '#9a3412' },
  requirementsButtonContainer: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  requirementsButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 8, gap: 8 },
  requirementsButtonText: { fontSize: 13, fontWeight: '600', color: '#2563eb' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#1f2937', marginTop: 12 },
  requiredFormsList: { gap: 12 },
  requiredFormCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16 },
  requiredFormHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  requiredFormTitle: { fontSize: 16, fontWeight: '600', color: '#1f2937', marginBottom: 4 },
  requiredFormDescription: { fontSize: 13, color: '#6b7280', lineHeight: 18 },
  fulfillmentStatusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  fulfillmentStatusText: { fontSize: 12, fontWeight: '600' },
  requiredFormInfo: { marginBottom: 12 },
  viewResponsesButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, backgroundColor: '#2563eb', borderRadius: 8, marginTop: 12, gap: 8 },
  viewResponsesButtonText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  responseInfoCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16, marginBottom: 20 },
  fulfillmentBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start' },
  fulfillmentText: { fontSize: 11, fontWeight: '600' },
  answersSection: { backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  emptyAnswers: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 16, color: '#6b7280', marginTop: 12 },
  answersList: { gap: 12 },
  answerCard: { backgroundColor: '#f9fafb', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  questionText: { fontSize: 15, fontWeight: '600', color: '#1f2937', marginBottom: 8 },
  answerText: { fontSize: 14, color: '#4b5563', lineHeight: 20 },
  fileButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 6 },
  fileButtonText: { color: '#2563eb', fontSize: 14, fontWeight: '600' },
  requirementsSection: { marginTop: 20 },
  requirementsProgress: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 },
  progressInfo: { flex: 1 },
  progressTitle: { fontSize: 15, fontWeight: '600', color: '#1f2937' },
  progressSubtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  progressPercentage: { fontSize: 24, fontWeight: 'bold', color: '#1f2937' },
  requirementsList: { gap: 12 },
  requirementItem: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16 },
  requirementHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  requirementTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1f2937', marginRight: 8 },
  requirementStatusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  requirementStatusText: { fontSize: 11, fontWeight: '600' },
  requirementDescription: { fontSize: 13, color: '#6b7280', marginBottom: 8, lineHeight: 18 },
  requirementResponsible: { fontSize: 12, color: '#6b7280' },
  requirementCompletedInfo: { marginTop: 8, padding: 10, backgroundColor: '#dcfce7', borderWidth: 1, borderColor: '#86efac', borderRadius: 8 },
  requirementCompletedText: { fontSize: 12, color: '#15803d' },
  offlineWarning: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#fed7aa', borderRadius: 8, marginTop: 16, gap: 8 },
  offlineWarningText: { fontSize: 13, fontWeight: '600', color: '#9a3412' },
});

export default ApproversDetailModal;