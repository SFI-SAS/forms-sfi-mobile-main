/* eslint-disable prettier/prettier */
import * as FileSystem from "expo-file-system";

export const sendResponsesToAPI = async (formId, responses) => {
  const formData = new FormData();

  responses.forEach((response, index) => {
    formData.append(
      "token",
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjZ29tZXpAc2Zpc2FzLmNvbSIsImV4cCI6MTc0MjQ3MjM2OH0.1NY0oc1vYVcqwziMMa8vmoF41XgpqIr-Rh0Cf6PMI-c"
    );
    formData.append("id_form", formId);
    formData.append("reference", "000321");
    if (response.type === "text") {
      formData.append(`text_${index}`, response.content);
    } else if (response.type === "image") {
      const fileName = response.content.split("/").pop();
      const match = /\.(\w+)$/.exec(fileName);
      const type = match ? `image/${match[1]}` : `image`;

      formData.append(`data_file`, {
        uri: response.content,
        name: fileName,
        type,
      });
    }
  });

  try {
    const response = await fetch(
      `https://54b8-179-33-13-68.ngrok-free.app/response_user/submit_data`,
      {
        method: "POST",
        headers: {
          "Content-Type": "multipart/form-data",
        },
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error("Failed to sync responses with the API");
    }

    await Promise.all(
      responses.map(async (response) => {
        if (response.type === "image") {
          await FileSystem.deleteAsync(response.content, { idempotent: true });
        }
      })
    );
  } catch (error) {
    console.error("API error:", error);
    throw error;
  }
};

// export const getFormsToAPI = async (accessToken) => {
//   accessToken =
//     "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjZ29tZXpAc2Zpc2FzLmNvbSIsImV4cCI6MTc0MjQ3MjM2OH0.1NY0oc1vYVcqwziMMa8vmoF41XgpqIr-Rh0Cf6PMI-c";
//   try {
//     const response = await fetch(
//       `https://api-forms.sfisas.com.co/forms/?skip=0&limit=10`,
//       {
//         headers: {
//           Authorization: `Bearer ${accessToken}`,
//         },
//       }
//     );
//     const json = await response.json();
//     if (!response.ok) {
//       throw new Error("Failed to sync responses with the API");
//     }
//     return json;
//   } catch (error) {
//     console.error("API error:", error);
//     throw error;
//   }
// };

export const getFormToAPI = async (form_id, accessToken) => {
  accessToken =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjZ29tZXpAc2Zpc2FzLmNvbSIsImV4cCI6MTc0MjQ3MjM2OH0.1NY0oc1vYVcqwziMMa8vmoF41XgpqIr-Rh0Cf6PMI-c";
  try {
    const response = await fetch(
      `https://54b8-179-33-13-68.ngrok-free.app/forms/${form_id}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    const json = await response.json();
    if (!response.ok) {
      throw new Error("Failed to sync responses with the API");
    }

    return json;
  } catch (error) {
    console.error("API error:", error);
    throw error;
  }
};
