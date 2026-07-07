import firebase_admin
from firebase_admin import credentials, firestore
import os

# During local testing, point this to your downloaded Firebase service account key
# In Cloud Run, it will automatically use the default service account.
cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")

if not firebase_admin._apps:
    if cred_path:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
    else:
        firebase_admin.initialize_app()

db = firestore.client()