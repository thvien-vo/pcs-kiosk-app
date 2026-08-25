# Cấu trúc tin nhắn WebSocket (Schema)

Tin nhắn báo kết quả AI:
{ 
  "event": "ai_result", 
  "payload": { 
    "qrData": "string", 
    "expiresIn": 60 
  } 
}

Tin nhắn báo trạng thái hệ thống:
{ 
  "event": "system_status", 
  "payload": { 
    "status": "ok|error|maintenance", 
    "message": "string" 
  } 
}