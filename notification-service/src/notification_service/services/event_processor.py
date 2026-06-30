"""
Kafka event processor — routes events from all services to notifications/emails.

Each event_type maps to: in-app notification, email, or both.
This runs as a background asyncio task consuming from multiple topics.
"""

import json
import logging

from aiokafka import AIOKafkaConsumer
from sqlalchemy.ext.asyncio import AsyncSession

from notification_service.core.config import settings
from notification_service.models.notification import NotificationType
from notification_service.services import email_service, notification_service

logger = logging.getLogger(__name__)


async def process_event(event: dict, db: AsyncSession) -> None:
    event_type = event.get("event_type", "")
    payload = event.get("payload", {})

    try:
        import uuid

        if event_type == "user.registered":
            await email_service.send_email(
                to=payload.get("email", ""),
                subject="Welcome to NexusOne AI!",
                html_body=email_service._welcome_html(payload.get("full_name", "")),
            )

        elif event_type == "org.member.invited":
            await email_service.send_email(
                to=payload.get("email", ""),
                subject="You've been invited to NexusOne AI",
                html_body=email_service._invitation_html(
                    org_name=payload.get("organization_name", "an organization"),
                    token=payload.get("token", ""),
                    org_slug=payload.get("organization_slug", ""),
                ),
            )

        # Commented out to prevent duplicate notifications (system notifications vs workflow notifications)
        # elif event_type == "task.assigned" and payload.get("assignee_id"):
        #     await notification_service.create_notification(
        #         db,
        #         user_id=uuid.UUID(payload["assignee_id"]),
        #         org_id=uuid.UUID(payload["organization_id"]) if payload.get("organization_id") else None,
        #         notification_type=NotificationType.TASK_ASSIGNED,
        #         title="You have been assigned a task",
        #         body=payload.get("task_title", "A task was assigned to you"),
        #         action_url=f"/projects/{payload.get('project_id')}",
        #         metadata=payload,
        #     )
        #     email = payload.get("assignee_email")
        #     if email:
        #         task_url = f"{settings.FRONTEND_URL}/projects/{payload.get('project_id')}"
        #         await email_service.send_email(
        #             to=email,
        #             subject="New task assigned to you",
        #             html_body=email_service._assignment_html(
        #                 task_title=payload.get("task_title", "Task"),
        #                 task_url=task_url,
        #                 assigner_name="Someone"
        #             )
        #         )

        # Commented out to prevent duplicate notifications (system notifications vs workflow notifications)
        # elif event_type == "task.completed" and payload.get("reporter_id"):
        #     await notification_service.create_notification(
        #         db,
        #         user_id=uuid.UUID(payload["reporter_id"]),
        #         org_id=uuid.UUID(payload["organization_id"]) if payload.get("organization_id") else None,
        #         notification_type=NotificationType.TASK_COMPLETED,
        #         title="A task you reported was completed",
        #         body=payload.get("task_title", "Task completed"),
        #         action_url=f"/projects/{payload.get('project_id')}/tasks/{payload.get('task_id')}",
        #         metadata=payload,
        #     )

        elif event_type == "org.member.removed":
            user_email = payload.get("user_email", "")
            reason = payload.get("reason", "")
            org_name = payload.get("organization_name", "your organization")
            if user_email and reason:
                await email_service.send_email(
                    to=user_email,
                    subject=f"Your access to {org_name} has been removed",
                    html_body=email_service._removal_html(org_name=org_name, reason=reason),
                )

        elif event_type == "chat.message.sent":
            content = payload.get("content_preview", "")
            channel_name = payload.get("channel_name", "a channel")
            sender_email = payload.get("sender_email", "Someone")
            org_id_str = payload.get("organization_id")
            org_id = uuid.UUID(org_id_str) if org_id_str else None

            # Notify every org member (except the sender) about the new message
            notified_user_ids: set[str] = set()
            for recipient in payload.get("notification_recipients", []):
                user_id_str = recipient.get("user_id")
                if not user_id_str:
                    continue
                await notification_service.create_notification(
                    db,
                    user_id=uuid.UUID(user_id_str),
                    org_id=org_id,
                    notification_type=NotificationType.MENTION,
                    title=f"New message in #{channel_name}",
                    body=f"{sender_email}: {content[:120]}",
                    action_url="/chat",
                    metadata=payload,
                )
                notified_user_ids.add(user_id_str)

            # Also handle explicit @mentions not already covered above
            for email, user_id_str in payload.get("mention_user_ids", {}).items():
                if user_id_str in notified_user_ids:
                    continue
                await notification_service.create_notification(
                    db,
                    user_id=uuid.UUID(user_id_str),
                    org_id=org_id,
                    notification_type=NotificationType.MENTION,
                    title=f"You were mentioned in #{channel_name}",
                    body=content[:200],
                    action_url="/chat",
                    metadata=payload,
                )

        elif event_type == "org.member.joined":
            logger.info("Member joined org: %s", payload)

        # Commented out to prevent duplicate notifications (system notification vs workflow notification)
        # elif event_type == "project.created" and payload.get("owner_id"):
        #     await notification_service.create_notification(
        #         db,
        #         user_id=uuid.UUID(payload["owner_id"]),
        #         org_id=uuid.UUID(payload["organization_id"]) if payload.get("organization_id") else None,
        #         notification_type=NotificationType.SYSTEM,
        #         title="Project Created",
        #         body=f"Project '{payload.get('name')}' ({payload.get('key')}) has been successfully created.",
        #         action_url=f"/projects/{payload.get('project_id')}",
        #         metadata=payload,
        #     )

        elif event_type == "workflow.triggered":
            logger.info("Workflow triggered: %s", payload)

        elif event_type == "workflow.notification":
            # In-app notification sent by a workflow action
            user_id_str = payload.get("user_id")
            org_id_str = payload.get("organization_id")
            if user_id_str:
                try:
                    await notification_service.create_notification(
                        db,
                        user_id=uuid.UUID(user_id_str),
                        org_id=uuid.UUID(org_id_str) if org_id_str else None,
                        notification_type=NotificationType.WORKFLOW_TRIGGERED,
                        title=payload.get("subject", "Workflow notification"),
                        body=payload.get("message", "A workflow action was triggered."),
                        action_url=payload.get("action_url", "/"),
                        metadata=payload,
                    )
                    logger.info("Workflow in-app notification created for user %s", user_id_str)
                except Exception:
                    logger.exception("Failed to create workflow notification for user %s", user_id_str)

        elif event_type == "workflow.email":
            # Email sent by a workflow action
            to = payload.get("to", "")
            subject = payload.get("subject", "NexusOne: Workflow notification")
            body_text = payload.get("body", "")
            action_url = payload.get("action_url", "")
            if to:
                await email_service.send_email(
                    to=to,
                    subject=subject,
                    html_body=email_service._workflow_html(
                        subject=subject,
                        message=body_text,
                        action_url=action_url,
                    ),
                )
                logger.info("Workflow email sent to=%s subject=%s", to, subject)

        # Commented out to prevent duplicate notifications (system/assignment notifications vs workflow notifications)
        # elif event_type == "task.created":
        #     reporter_id = payload.get("reporter_id")
        #     if reporter_id:
        #         await notification_service.create_notification(
        #             db,
        #             user_id=uuid.UUID(reporter_id),
        #             org_id=uuid.UUID(payload["organization_id"]) if payload.get("organization_id") else None,
        #             notification_type=NotificationType.SYSTEM,
        #             title="Task Created",
        #             body=f"Task #{payload.get('task_number', '')}: '{payload.get('title', 'Task')}' has been successfully created.",
        #             action_url=f"/projects/{payload.get('project_id')}",
        #             metadata=payload,
        #         )
        #     assignee_id = payload.get("assignee_id")
        #     if assignee_id:
        #         await notification_service.create_notification(
        #             db,
        #             user_id=uuid.UUID(assignee_id),
        #             org_id=uuid.UUID(payload["organization_id"]) if payload.get("organization_id") else None,
        #             notification_type=NotificationType.TASK_ASSIGNED,
        #             title="You have been assigned a task",
        #             body=payload.get("title", "A task was assigned to you"),
        #             action_url=f"/projects/{payload.get('project_id')}",
        #             metadata=payload,
        #         )
        #         email = payload.get("assignee_email")
        #         if email:
        #             task_url = f"{settings.FRONTEND_URL}/projects/{payload.get('project_id')}"
        #             await email_service.send_email(
        #                 to=email,
        #                 subject="New task assigned to you",
        #                 html_body=email_service._assignment_html(
        #                     task_title=payload.get("title", "Task"),
        #                     task_url=task_url,
        #                     assigner_name="Someone"
        #                         )
        #                     )
        #                 )

        elif event_type == "comment.created":
            # Send email notifications
            mentioned_emails = payload.get("mentioned_emails", [])
            for email in mentioned_emails:
                project_id = payload.get("project_id")
                task_url = f"{settings.FRONTEND_URL}/projects/{project_id}"
                await email_service.send_email(
                    to=email,
                    subject=f"Mentioned in task comment",
                    html_body=email_service._mention_html(
                        task_title=payload.get("task_title", "Task"),
                        task_url=task_url,
                        comment_content=payload.get("content", ""),
                        author_name=payload.get("author_name", "Someone")
                    )
                )

            # Create in-app notifications
            mentioned_user_ids = payload.get("mentioned_user_ids", [])
            for user_id_str in mentioned_user_ids:
                try:
                    await notification_service.create_notification(
                        db,
                        user_id=uuid.UUID(user_id_str),
                        org_id=uuid.UUID(payload["organization_id"]) if payload.get("organization_id") else None,
                        notification_type=NotificationType.MENTION,
                        title="Mentioned in task comment",
                        body=f"{payload.get('author_name', 'Someone')} mentioned you in a comment on task '{payload.get('task_title', 'Task')}'",
                        action_url=f"/projects/{payload.get('project_id')}",
                        metadata=payload,
                    )
                except Exception:
                    logger.exception("Failed to create in-app notification for user %s", user_id_str)

    except Exception:
        logger.exception("Error processing event %s", event_type)


async def start_consumer(db_session_factory) -> None:
    """Run as a background task — consumes Kafka events indefinitely."""
    consumer = AIOKafkaConsumer(
        *settings.kafka_topics_list,
        bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
        group_id=settings.KAFKA_CONSUMER_GROUP,
        value_deserializer=lambda v: json.loads(v.decode()),
        auto_offset_reset="earliest",
        enable_auto_commit=True,
        session_timeout_ms=30000,
        heartbeat_interval_ms=8000,
        max_poll_interval_ms=300000,
    )
    await consumer.start()
    logger.info("Kafka consumer started on topics: %s", settings.kafka_topics_list)
    try:
        async for msg in consumer:
            async with db_session_factory() as db:
                try:
                    await process_event(msg.value, db)
                    await db.commit()
                except Exception:
                    await db.rollback()
                    logger.exception("Failed to process Kafka message at offset %s", msg.offset)
    finally:
        await consumer.stop()
        logger.info("Kafka consumer stopped")
