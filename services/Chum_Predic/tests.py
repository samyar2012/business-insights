import pandas as pd
from pathlib import Path

from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, accuracy_score, confusion_matrix

DIR_PATH = Path(__file__).resolve().parent
file_p - DIR_PATH / "churn.csv"
df = pd.read_csv(file_path)

print("Loaded file from:", file_path)
print("Dataset shape:", df.shape)
print(df.head())

service_features = [
    "InternetService",
    "OnlineSecurity",
    "OnlineBackup",
    "DeviceProtection",
    "TechSupport",
    "StreamingTV",
    "StreamingMovies",
    "PhoneService",
    "MultipleLines",
]
target_col = "Churn"

df = df[service_features + [target_col]].copy()
df = df.dropna()
df[target_col] = df[target_col].map({"Yes": 100, "No": 0})
df = df.dropna(subset=[target_col])
df[target_col] = df[target_col].astype(int)
X = df[service_features]
y = df[target_col]
X = pd.get_dummies(X, drop_first=False)
print("\nEncoded feature shape:", X.shape)
print("Target distribution:\n", y.value_counts())



rf_model = RandomForestClassifier(
    n_estimators=300,
    class_weight="balanced",
    random_state=42
)
rf_model.fit(X_train, y_train)
y_pred = rf_model.predict(X_test)
print("RF Model Accuracy:", accuracy_score(y_test, y_pred))
print("RF Model Classification Report:\n", classification_report(y_test, y_pred))
print("RF Model Confusion Matrix:\n", confusion_matrix(y_test, y_pred))

