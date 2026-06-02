import sqlite3

def main():
    conn = sqlite3.connect('C:\\Users\\sideb\\.gemini\\antigravity\\scratch\\pdf-knowledge-base\\server\\data\\app.db')
    cursor = conn.cursor()
    
    # Query for any topic linked to Graph books
    cursor.execute("""
        SELECT d.filename, t.topic, t.description 
        FROM topics t 
        JOIN documents d ON t.document_id = d.id 
        WHERE d.filename LIKE '%Graph%' 
        OR d.folder_path LIKE '%Graph%'
    """)
    
    rows = cursor.fetchall()
    print(f"Found {len(rows)} Graph-related topics:")
    for row in rows:
        print(f"\nBook: {row[0]}\nTopic: {row[1]}\nDescription: {row[2]}\n" + "-"*50)
        
    conn.close()

if __name__ == "__main__":
    main()
