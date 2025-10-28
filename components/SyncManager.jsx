import { useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import useNetInfo from "../hooks/useNetInfo";

// URL personalizada almacenada
const BACKEND_URL_KEY = "backend_url";
const getBackendUrl = async () => {
  const stored = await AsyncStorage.getItem(BACKEND_URL_KEY);
  return stored || "";
};

const SyncManager = () => {
  const isConnected = useNetInfo();

  useEffect(() => {
    const replayPending = async () => {
      if (!isConnected) return;
      const storedPendingForms = await AsyncStorage.getItem("pending_forms");
      const queue = storedPendingForms ? JSON.parse(storedPendingForms) : [];
      if (!Array.isArray(queue) || queue.length === 0) return;

      const token = await AsyncStorage.getItem("authToken");
      const backendUrl = await getBackendUrl();
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      const remaining = [];
      for (const item of queue) {
        try {
          // Step 1: create response and get response_id
          const saveResp = await fetch(
            `${backendUrl}/responses/save-response/${item.id}?action=send_and_close`,
            {
              method: "POST",
              headers,
              body: JSON.stringify(item.answersForApi || []),
            }
          );
          const saveRespJson = await saveResp.json();
          const responseId = saveRespJson?.response_id;
          if (!responseId)
            throw new Error("response_id ausente en save-response");

          // Step 2: send answers sequentially
          const answers = item.answersFull || [];
          for (let i = 0; i < answers.length; i++) {
            const ans = answers[i];
            const isFile = ans.question_type === "file" || !!ans.file_path;
            const payload = {
              response_id: responseId,
              question_id: ans.question_id,
              answer_text: isFile ? "" : ans.answer_text,
              file_path: ans.file_path || "",
            };
            const res = await fetch(
              `${backendUrl}/responses/save-answers/?action=send_and_close`,
              {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
              }
            );
            const resJson = await res.json();
            if (!res.ok) throw new Error(JSON.stringify(resJson));

            // Step 3: associate file serials when applicable
            if (
              isFile &&
              item.fileSerials &&
              item.fileSerials[ans.question_id] &&
              resJson?.answer?.answer_id
            ) {
              try {
                const serialPayload = {
                  answer_id: resJson.answer.answer_id,
                  serial: item.fileSerials[ans.question_id],
                };
                const sres = await fetch(
                  `${backendUrl}/responses/file-serials/`,
                  {
                    method: "POST",
                    headers,
                    body: JSON.stringify(serialPayload),
                  }
                );
                // ignore body; best-effort
                await sres.text();
              } catch {}
            }
          }

          console.log(
            `✅ Offline envío reintentado para formulario ${item.id}`
          );
        } catch (err) {
          console.error(
            `❌ Falló la reintento offline para formulario ${item.id}:`,
            err
          );
          // keep it in the queue for later retry
          remaining.push(item);
        }
      }

      if (remaining.length > 0) {
        await AsyncStorage.setItem("pending_forms", JSON.stringify(remaining));
      } else {
        await AsyncStorage.removeItem("pending_forms");
      }
    };

    replayPending();
  }, [isConnected]);

  return null;
};

export default SyncManager;
