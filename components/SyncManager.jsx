import { useEffect } from "react";
import {
  getOfflineResponses,
  clearOfflineResponses,
} from "../services/storage";
import { sendResponsesToAPI } from "../services/api";
import useNetInfo from "../hooks/useNetInfo";

const SyncManager = () => {
  const isConnected = useNetInfo();

  useEffect(() => {
    const syncResponses = async () => {
      if (isConnected) {
        const offlineResponses = await getOfflineResponses();
        for (const [formId, responses] of Object.entries(offlineResponses)) {
          try {
            await sendResponsesToAPI(formId, responses);
            delete offlineResponses[formId];
          } catch (error) {
            console.error(`Error syncing responses for form ${formId}:`, error);
          }
        }
        await clearOfflineResponses();
      }
    };

    syncResponses();
  }, [isConnected]);

  return null;
};

export default SyncManager;
